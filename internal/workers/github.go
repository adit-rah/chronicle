package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"
)

// GitHubWorker handles GitHub repository activity polling
type GitHubWorker struct {
	name     string
	config   *config.GitHubConfig
	interval time.Duration
	client   *github.Client
	lastSeen map[string]bool // Track seen events by ID
}

// NewGitHubWorker creates a new GitHub worker
func NewGitHubWorker(sourceConfig config.SourceConfig) (*GitHubWorker, error) {
	githubConfig, err := sourceConfig.GetGitHubConfig()
	if err != nil {
		return nil, err
	}

	// Create GitHub client
	var client *github.Client
	if githubConfig.Token != "" {
		ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: githubConfig.Token})
		tc := oauth2.NewClient(context.Background(), ts)
		client = github.NewClient(tc)
	} else {
		client = github.NewClient(nil)
	}

	return &GitHubWorker{
		name:     sourceConfig.Name,
		config:   githubConfig,
		interval: sourceConfig.Interval,
		client:   client,
		lastSeen: make(map[string]bool),
	}, nil
}

// InitializeLastSeen initializes the lastSeen map with existing events from database
func (w *GitHubWorker) InitializeLastSeen(existingEvents []string) {
	for _, eventID := range existingEvents {
		w.lastSeen[eventID] = true
	}
	log.Printf("GitHub worker %s: initialized with %d existing events", w.name, len(existingEvents))
}

// GetSourceType returns the source type
func (w *GitHubWorker) GetSourceType() models.SourceType {
	return models.SourceTypeGitHub
}

// GetName returns the worker name
func (w *GitHubWorker) GetName() string {
	return w.name
}

// Start begins the GitHub polling loop
func (w *GitHubWorker) Start(ctx context.Context, eventChan chan<- *models.Event) error {
	log.Printf("Starting GitHub worker: %s (Repo: %s/%s, Interval: %v)", 
		w.name, w.config.Owner, w.config.Repository, w.interval)

	// Initial fetch
	if err := w.fetchAndProcess(ctx, eventChan); err != nil {
		log.Printf("GitHub worker %s initial fetch error: %v", w.name, err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("GitHub worker %s stopping", w.name)
			return ctx.Err()
		case <-ticker.C:
			if err := w.fetchAndProcess(ctx, eventChan); err != nil {
				log.Printf("GitHub worker %s fetch error: %v", w.name, err)
			}
		}
	}
}

// fetchAndProcess fetches GitHub events and processes new ones
func (w *GitHubWorker) fetchAndProcess(ctx context.Context, eventChan chan<- *models.Event) error {
	// Fetch repository events
	events, _, err := w.client.Activity.ListRepositoryEvents(ctx, w.config.Owner, w.config.Repository, &github.ListOptions{
		PerPage: 30,
	})
	if err != nil {
		return fmt.Errorf("failed to fetch GitHub events: %w", err)
	}

	newEventsCount := 0
	for _, ghEvent := range events {
		if ghEvent.ID == nil {
			continue
		}

		sourceID := *ghEvent.ID

		// Skip if we've already seen this event
		if w.lastSeen[sourceID] {
			continue
		}

		// Convert GitHub event to our event model
		event := w.convertGitHubEvent(ghEvent)
		if event == nil {
			continue // Skip unsupported event types
		}

		// Send event
		select {
		case eventChan <- event:
			w.lastSeen[sourceID] = true
			newEventsCount++
		case <-time.After(5 * time.Second):
			log.Printf("GitHub worker %s: timeout sending event", w.name)
		}
	}

	if newEventsCount > 0 {
		log.Printf("GitHub worker %s: processed %d new events", w.name, newEventsCount)
	}

	return nil
}

// convertGitHubEvent converts a GitHub event to our unified event model
func (w *GitHubWorker) convertGitHubEvent(ghEvent *github.Event) *models.Event {
	if ghEvent.ID == nil || ghEvent.Type == nil || ghEvent.CreatedAt == nil {
		return nil
	}

	sourceID := *ghEvent.ID
	eventType := *ghEvent.Type
	timestamp := ghEvent.CreatedAt.Time

	// Base metadata
	metadata := models.Metadata{
		"repository": fmt.Sprintf("%s/%s", w.config.Owner, w.config.Repository),
		"event_type": eventType,
	}

	if ghEvent.Actor != nil && ghEvent.Actor.Login != nil {
		metadata["actor"] = *ghEvent.Actor.Login
		if ghEvent.Actor.HTMLURL != nil {
			metadata["actor_url"] = *ghEvent.Actor.HTMLURL
		}
	}

	var title, link string
	var category models.EventCategory

	switch eventType {
	case "PushEvent":
		category = models.EventCategoryCommit
		title = fmt.Sprintf("Push to %s/%s", w.config.Owner, w.config.Repository)
		link = fmt.Sprintf("https://github.com/%s/%s", w.config.Owner, w.config.Repository)
		
		if payload := ghEvent.Payload(); payload != nil {
			if pushPayload, ok := payload.(*github.PushEvent); ok {
				if pushPayload.Size != nil {
					metadata["commit_count"] = *pushPayload.Size
				}
				if pushPayload.Ref != nil {
					metadata["ref"] = *pushPayload.Ref
				}
				if len(pushPayload.Commits) > 0 {
					commit := pushPayload.Commits[0]
					if commit.Message != nil {
						title = fmt.Sprintf("Push: %s", *commit.Message)
						if len(*commit.Message) > 100 {
							title = fmt.Sprintf("Push: %s...", (*commit.Message)[:97])
						}
					}
					if commit.URL != nil {
						link = *commit.URL
					}
				}
			}
		}

	case "IssuesEvent":
		category = models.EventCategoryIssue
		title = fmt.Sprintf("Issue activity in %s/%s", w.config.Owner, w.config.Repository)
		link = fmt.Sprintf("https://github.com/%s/%s/issues", w.config.Owner, w.config.Repository)
		
		if payload := ghEvent.Payload(); payload != nil {
			if issuePayload, ok := payload.(*github.IssuesEvent); ok {
				if issuePayload.Action != nil {
					metadata["action"] = *issuePayload.Action
				}
				if issuePayload.Issue != nil {
					if issuePayload.Issue.Title != nil {
						title = fmt.Sprintf("Issue %s: %s", *issuePayload.Action, *issuePayload.Issue.Title)
					}
					if issuePayload.Issue.HTMLURL != nil {
						link = *issuePayload.Issue.HTMLURL
					}
					if issuePayload.Issue.Number != nil {
						metadata["issue_number"] = *issuePayload.Issue.Number
					}
				}
			}
		}

	case "PullRequestEvent":
		category = models.EventCategoryPullRequest
		title = fmt.Sprintf("Pull request activity in %s/%s", w.config.Owner, w.config.Repository)
		link = fmt.Sprintf("https://github.com/%s/%s/pulls", w.config.Owner, w.config.Repository)
		
		if payload := ghEvent.Payload(); payload != nil {
			if prPayload, ok := payload.(*github.PullRequestEvent); ok {
				if prPayload.Action != nil {
					metadata["action"] = *prPayload.Action
				}
				if prPayload.PullRequest != nil {
					if prPayload.PullRequest.Title != nil {
						title = fmt.Sprintf("PR %s: %s", *prPayload.Action, *prPayload.PullRequest.Title)
					}
					if prPayload.PullRequest.HTMLURL != nil {
						link = *prPayload.PullRequest.HTMLURL
					}
					if prPayload.PullRequest.Number != nil {
						metadata["pr_number"] = *prPayload.PullRequest.Number
					}
				}
			}
		}

	case "ReleaseEvent":
		category = models.EventCategoryRelease
		title = fmt.Sprintf("Release in %s/%s", w.config.Owner, w.config.Repository)
		link = fmt.Sprintf("https://github.com/%s/%s/releases", w.config.Owner, w.config.Repository)
		
		if payload := ghEvent.Payload(); payload != nil {
			if releasePayload, ok := payload.(*github.ReleaseEvent); ok {
				if releasePayload.Action != nil {
					metadata["action"] = *releasePayload.Action
				}
				if releasePayload.Release != nil {
					if releasePayload.Release.TagName != nil {
						title = fmt.Sprintf("Release %s: %s", *releasePayload.Action, *releasePayload.Release.TagName)
					}
					if releasePayload.Release.HTMLURL != nil {
						link = *releasePayload.Release.HTMLURL
					}
					if releasePayload.Release.Name != nil {
						metadata["release_name"] = *releasePayload.Release.Name
					}
				}
			}
		}

	default:
		// For unsupported event types, create a generic event
		category = models.EventCategoryCommit // Default category
		title = fmt.Sprintf("%s in %s/%s", eventType, w.config.Owner, w.config.Repository)
		link = fmt.Sprintf("https://github.com/%s/%s", w.config.Owner, w.config.Repository)
	}

	return &models.Event{
		SourceType: models.SourceTypeGitHub,
		SourceID:   sourceID,
		Category:   category,
		Title:      title,
		Link:       link,
		Timestamp:  timestamp,
		Metadata:   metadata,
	}
} 