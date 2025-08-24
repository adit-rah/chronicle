package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// SourceType represents the type of source that generated the event
type SourceType string

const (
	SourceTypeRSS     SourceType = "rss"
	SourceTypeGitHub  SourceType = "github"
	SourceTypeWeather SourceType = "weather"
	SourceTypeJobs    SourceType = "jobs"
)

// EventCategory represents the category of the event
type EventCategory string

const (
	EventCategoryArticle    EventCategory = "article"
	EventCategoryCommit     EventCategory = "commit"
	EventCategoryWeather    EventCategory = "weather"
	EventCategoryJobPosting EventCategory = "job_posting"
	EventCategoryIssue      EventCategory = "issue"
	EventCategoryPullRequest EventCategory = "pull_request"
	EventCategoryRelease    EventCategory = "release"
)

// Metadata represents flexible metadata storage for source-specific details
type Metadata map[string]interface{}

// Value implements the driver.Valuer interface for database storage
func (m Metadata) Value() (driver.Value, error) {
	if m == nil {
		return nil, nil
	}
	return json.Marshal(m)
}

// Scan implements the sql.Scanner interface for database retrieval
func (m *Metadata) Scan(value interface{}) error {
	if value == nil {
		*m = nil
		return nil
	}
	
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("cannot scan %T into Metadata", value)
	}
	
	return json.Unmarshal(bytes, m)
}

// Event represents a normalized event from any source
type Event struct {
	ID          int64         `json:"id" db:"id"`
	SourceType  SourceType    `json:"source_type" db:"source_type"`
	SourceID    string        `json:"source_id" db:"source_id"` // Unique identifier from source
	Category    EventCategory `json:"category" db:"category"`
	Title       string        `json:"title" db:"title"`
	Link        string        `json:"link" db:"link"`
	Timestamp   time.Time     `json:"timestamp" db:"timestamp"`
	Metadata    Metadata      `json:"metadata" db:"metadata"`
	CreatedAt   time.Time     `json:"created_at" db:"created_at"`
}

// EventFilter represents filtering options for querying events
type EventFilter struct {
	SourceTypes []SourceType  `json:"source_types"`
	Categories  []EventCategory `json:"categories"`
	Keywords    []string      `json:"keywords"`
	StartTime   *time.Time    `json:"start_time"`
	EndTime     *time.Time    `json:"end_time"`
	Limit       int           `json:"limit"`
	Offset      int           `json:"offset"`
	Tags        []string      `json:"tags"`
}

// EventListener represents a configurable event source listener
type EventListener struct {
	ID          int64         `json:"id" db:"id"`
	Name        string        `json:"name" db:"name"`
	Type        SourceType    `json:"type" db:"type"`
	Enabled     bool          `json:"enabled" db:"enabled"`
	Config      Metadata      `json:"config" db:"config"`
	Tags        []string      `json:"tags" db:"tags"`
	Interval    time.Duration `json:"interval" db:"interval"`
	CreatedAt   time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at" db:"updated_at"`
}

// EventTag represents a tag that can be associated with events
type EventTag struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Color     string    `json:"color" db:"color"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// EventTagAssociation links events to tags
type EventTagAssociation struct {
	EventID int64 `json:"event_id" db:"event_id"`
	TagID   int64 `json:"tag_id" db:"tag_id"`
} 