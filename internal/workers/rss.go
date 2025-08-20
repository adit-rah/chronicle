package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
	"github.com/mmcdole/gofeed"
)

// RSSWorker handles RSS feed polling
type RSSWorker struct {
	name     string
	config   *config.RSSConfig
	interval time.Duration
	parser   *gofeed.Parser
	lastSeen map[string]bool // Track seen items by GUID/Link
}

// NewRSSWorker creates a new RSS worker
func NewRSSWorker(sourceConfig config.SourceConfig) (*RSSWorker, error) {
	rssConfig, err := sourceConfig.GetRSSConfig()
	if err != nil {
		return nil, err
	}

	return &RSSWorker{
		name:     sourceConfig.Name,
		config:   rssConfig,
		interval: sourceConfig.Interval,
		parser:   gofeed.NewParser(),
		lastSeen: make(map[string]bool),
	}, nil
}

// GetSourceType returns the source type
func (w *RSSWorker) GetSourceType() models.SourceType {
	return models.SourceTypeRSS
}

// GetName returns the worker name
func (w *RSSWorker) GetName() string {
	return w.name
}

// Start begins the RSS polling loop
func (w *RSSWorker) Start(ctx context.Context, eventChan chan<- *models.Event) error {
	log.Printf("Starting RSS worker: %s (URL: %s, Interval: %v)", w.name, w.config.URL, w.interval)

	// Initial fetch
	if err := w.fetchAndProcess(eventChan); err != nil {
		log.Printf("RSS worker %s initial fetch error: %v", w.name, err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("RSS worker %s stopping", w.name)
			return ctx.Err()
		case <-ticker.C:
			if err := w.fetchAndProcess(eventChan); err != nil {
				log.Printf("RSS worker %s fetch error: %v", w.name, err)
			}
		}
	}
}

// fetchAndProcess fetches the RSS feed and processes new items
func (w *RSSWorker) fetchAndProcess(eventChan chan<- *models.Event) error {
	feed, err := w.parser.ParseURL(w.config.URL)
	if err != nil {
		return fmt.Errorf("failed to parse RSS feed: %w", err)
	}

	newItemsCount := 0
	for _, item := range feed.Items {
		// Use GUID if available, otherwise use Link as unique identifier
		sourceID := item.GUID
		if sourceID == "" {
			sourceID = item.Link
		}
		if sourceID == "" {
			continue // Skip items without unique identifier
		}

		// Skip if we've already seen this item
		if w.lastSeen[sourceID] {
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

		// Create metadata
		metadata := models.Metadata{
			"feed_title":       feed.Title,
			"feed_description": feed.Description,
			"feed_link":        feed.Link,
		}

		if item.Description != "" {
			metadata["description"] = item.Description
		}
		if item.Content != "" {
			metadata["content"] = item.Content
		}
		if len(item.Authors) > 0 {
			metadata["author"] = item.Authors[0].Name
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
			SourceType: models.SourceTypeRSS,
			SourceID:   sourceID,
			Category:   models.EventCategoryArticle,
			Title:      item.Title,
			Link:       item.Link,
			Timestamp:  timestamp,
			Metadata:   metadata,
		}

		// Send event
		select {
		case eventChan <- event:
			w.lastSeen[sourceID] = true
			newItemsCount++
		case <-time.After(5 * time.Second):
			log.Printf("RSS worker %s: timeout sending event", w.name)
		}
	}

	if newItemsCount > 0 {
		log.Printf("RSS worker %s: processed %d new items", w.name, newItemsCount)
	}

	return nil
} 