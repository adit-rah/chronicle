package workers

import (
	"context"
	"crypto/md5"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
	"github.com/mmcdole/gofeed"
)

// JobsWorker handles job postings polling
type JobsWorker struct {
	name     string
	config   *config.JobsConfig
	interval time.Duration
	client   *http.Client
	parser   *gofeed.Parser
	lastSeen map[string]bool // Track seen jobs by ID
}

// NewJobsWorker creates a new Jobs worker
func NewJobsWorker(sourceConfig config.SourceConfig) (*JobsWorker, error) {
	jobsConfig, err := sourceConfig.GetJobsConfig()
	if err != nil {
		return nil, err
	}

	return &JobsWorker{
		name:     sourceConfig.Name,
		config:   jobsConfig,
		interval: sourceConfig.Interval,
		client:   &http.Client{Timeout: 30 * time.Second},
		parser:   gofeed.NewParser(),
		lastSeen: make(map[string]bool),
	}, nil
}

// GetSourceType returns the source type
func (w *JobsWorker) GetSourceType() models.SourceType {
	return models.SourceTypeJobs
}

// GetName returns the worker name
func (w *JobsWorker) GetName() string {
	return w.name
}

// InitializeLastSeen initializes the lastSeen map with existing events from database
func (w *JobsWorker) InitializeLastSeen(existingEvents []string) {
	for _, eventID := range existingEvents {
		w.lastSeen[eventID] = true
	}
	log.Printf("Jobs worker %s: initialized with %d existing events", w.name, len(existingEvents))
}

// Start begins the Jobs polling loop
func (w *JobsWorker) Start(ctx context.Context, eventChan chan<- *models.Event) error {
	log.Printf("Starting Jobs worker: %s (URL: %s, Keywords: %v, Interval: %v)", 
		w.name, w.config.CompanyURL, w.config.Keywords, w.interval)

	// Initial fetch
	if err := w.fetchAndProcess(eventChan); err != nil {
		log.Printf("Jobs worker %s initial fetch error: %v", w.name, err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Jobs worker %s stopping", w.name)
			return ctx.Err()
		case <-ticker.C:
			if err := w.fetchAndProcess(eventChan); err != nil {
				log.Printf("Jobs worker %s fetch error: %v", w.name, err)
			}
		}
	}
}

// fetchAndProcess fetches job postings and processes matching ones
func (w *JobsWorker) fetchAndProcess(eventChan chan<- *models.Event) error {
	// Try to parse as RSS feed first (many companies have RSS feeds for jobs)
	if strings.Contains(w.config.CompanyURL, "rss") || strings.Contains(w.config.CompanyURL, "feed") {
		return w.fetchRSSJobs(eventChan)
	}

	// For non-RSS URLs, try to scrape job titles from HTML
	return w.fetchHTMLJobs(eventChan)
}

// fetchRSSJobs fetches jobs from RSS feeds
func (w *JobsWorker) fetchRSSJobs(eventChan chan<- *models.Event) error {
	feed, err := w.parser.ParseURL(w.config.CompanyURL)
	if err != nil {
		return fmt.Errorf("failed to parse jobs RSS feed: %w", err)
	}

	newJobsCount := 0
	for _, item := range feed.Items {
		// Use GUID if available, otherwise use Link as unique identifier
		sourceID := item.GUID
		if sourceID == "" {
			sourceID = item.Link
		}
		if sourceID == "" {
			// Create a hash from title and description as fallback
			sourceID = w.createJobID(item.Title, item.Description)
		}

		// Skip if we've already seen this job
		if w.lastSeen[sourceID] {
			continue
		}

		// Check if job matches keywords
		if !w.matchesKeywords(item.Title, item.Description) {
			continue
		}

		// Parse timestamp
		var timestamp time.Time
		if item.PublishedParsed != nil {
			timestamp = *item.PublishedParsed
		} else if item.UpdatedParsed != nil {
			timestamp = *item.UpdatedParsed
		} else {
			timestamp = time.Now()
		}

		// Extract location and company info from content
		location, company := w.extractJobInfo(item.Title, item.Description, feed.Title)

		// Create metadata
		metadata := models.Metadata{
			"company": company,
			"source":  "rss",
		}

		if location != "" {
			metadata["location"] = location
		}
		if item.Description != "" {
			metadata["description"] = item.Description
		}
		if item.Content != "" {
			metadata["content"] = item.Content
		}
		if len(item.Categories) > 0 {
			categories := make([]string, len(item.Categories))
			for i, cat := range item.Categories {
				categories[i] = cat
			}
			metadata["categories"] = categories
		}

		// Create event
		event := &models.Event{
			SourceType: models.SourceTypeJobs,
			SourceID:   sourceID,
			Category:   models.EventCategoryJobPosting,
			Title:      item.Title,
			Link:       item.Link,
			Timestamp:  timestamp,
			Metadata:   metadata,
		}

		// Send event
		select {
		case eventChan <- event:
			w.lastSeen[sourceID] = true
			newJobsCount++
		case <-time.After(5 * time.Second):
			log.Printf("Jobs worker %s: timeout sending event", w.name)
		}
	}

	if newJobsCount > 0 {
		log.Printf("Jobs worker %s: processed %d new job postings", w.name, newJobsCount)
	}

	return nil
}

// fetchHTMLJobs fetches jobs by scraping HTML (basic implementation)
func (w *JobsWorker) fetchHTMLJobs(eventChan chan<- *models.Event) error {
	resp, err := w.client.Get(w.config.CompanyURL)
	if err != nil {
		return fmt.Errorf("failed to fetch jobs page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jobs page returned status %d", resp.StatusCode)
	}

	// For now, create a simple event indicating we checked for jobs
	// In a production system, you'd want proper HTML parsing here
	sourceID := fmt.Sprintf("jobs-check-%s", time.Now().Format("2006-01-02"))
	
	// Skip if we've already created this check event today
	if w.lastSeen[sourceID] {
		return nil
	}

	// Create a basic "jobs checked" event
	event := &models.Event{
		SourceType: models.SourceTypeJobs,
		SourceID:   sourceID,
		Category:   models.EventCategoryJobPosting,
		Title:      fmt.Sprintf("Checked for jobs at %s", w.extractCompanyName(w.config.CompanyURL)),
		Link:       w.config.CompanyURL,
		Timestamp:  time.Now(),
		Metadata: models.Metadata{
			"company": w.extractCompanyName(w.config.CompanyURL),
			"source":  "html",
			"type":    "check",
		},
	}

	// Send event
	select {
	case eventChan <- event:
		w.lastSeen[sourceID] = true
		log.Printf("Jobs worker %s: sent job check event", w.name)
	case <-time.After(5 * time.Second):
		log.Printf("Jobs worker %s: timeout sending event", w.name)
	}

	return nil
}

// matchesKeywords checks if a job matches the configured keywords
func (w *JobsWorker) matchesKeywords(title, description string) bool {
	if len(w.config.Keywords) == 0 {
		return true // No keywords means accept all jobs
	}

	content := strings.ToLower(title + " " + description)
	
	for _, keyword := range w.config.Keywords {
		if strings.Contains(content, strings.ToLower(keyword)) {
			return true
		}
	}
	
	return false
}

// extractJobInfo extracts location and company information from job content
func (w *JobsWorker) extractJobInfo(title, description, feedTitle string) (location, company string) {
	// Extract company name
	company = w.extractCompanyName(feedTitle)
	if company == "" {
		company = w.extractCompanyName(w.config.CompanyURL)
	}

	// Try to extract location from title or description
	locationRegex := regexp.MustCompile(`(?i)(in|at|location:?)\s+([A-Za-z\s,]+?)(?:\s|$|,|\|)`)
	content := title + " " + description
	
	if matches := locationRegex.FindStringSubmatch(content); len(matches) > 2 {
		location = strings.TrimSpace(matches[2])
		// Clean up common artifacts
		location = strings.TrimSuffix(location, ",")
		location = strings.TrimSuffix(location, "|")
	}

	// Use configured location as fallback
	if location == "" && w.config.Location != "" {
		location = w.config.Location
	}

	return location, company
}

// extractCompanyName extracts company name from URL or feed title
func (w *JobsWorker) extractCompanyName(input string) string {
	// Try to extract from URL
	if strings.HasPrefix(input, "http") {
		// Remove protocol and path, extract domain
		input = strings.TrimPrefix(input, "http://")
		input = strings.TrimPrefix(input, "https://")
		parts := strings.Split(input, "/")
		if len(parts) > 0 {
			domain := parts[0]
			// Remove www. prefix
			domain = strings.TrimPrefix(domain, "www.")
			// Split by dots and take the main part
			domainParts := strings.Split(domain, ".")
			if len(domainParts) > 0 {
				return strings.Title(domainParts[0])
			}
		}
	}

	// Clean up feed title
	input = strings.ReplaceAll(input, "Jobs", "")
	input = strings.ReplaceAll(input, "Careers", "")
	input = strings.ReplaceAll(input, "RSS", "")
	input = strings.ReplaceAll(input, "Feed", "")
	input = strings.TrimSpace(input)
	
	if input != "" {
		return input
	}

	return "Unknown Company"
}

// createJobID creates a unique ID for a job posting
func (w *JobsWorker) createJobID(title, description string) string {
	content := title + description
	hash := md5.Sum([]byte(content))
	return fmt.Sprintf("job-%x", hash)[:16]
} 