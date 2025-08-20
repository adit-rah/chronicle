package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"event-aggregator/internal/models"
	_ "github.com/mattn/go-sqlite3"
)

type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite storage instance
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &SQLiteStore{db: db}
	if err := store.migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return store, nil
}

// migrate creates the database schema
func (s *SQLiteStore) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		source_type TEXT NOT NULL,
		source_id TEXT NOT NULL,
		category TEXT NOT NULL,
		title TEXT NOT NULL,
		link TEXT,
		timestamp DATETIME NOT NULL,
		metadata TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(source_type, source_id)
	);

	CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source_type);
	CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
	CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
	CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
	`

	_, err := s.db.Exec(schema)
	return err
}

// StoreEvent stores an event with deduplication
func (s *SQLiteStore) StoreEvent(event *models.Event) error {
	query := `
	INSERT OR IGNORE INTO events (
		source_type, source_id, category, title, link, timestamp, metadata, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`

	event.CreatedAt = time.Now()
	
	var metadataJSON []byte
	if event.Metadata != nil {
		var err error
		metadataJSON, err = event.Metadata.Value()
		if err != nil {
			return fmt.Errorf("failed to marshal metadata: %w", err)
		}
	}

	result, err := s.db.Exec(query,
		event.SourceType,
		event.SourceID,
		event.Category,
		event.Title,
		event.Link,
		event.Timestamp,
		metadataJSON,
		event.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert event: %w", err)
	}

	// Check if the event was actually inserted (not a duplicate)
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected > 0 {
		id, err := result.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get last insert ID: %w", err)
		}
		event.ID = id
	}

	return nil
}

// GetEvents retrieves events with filtering
func (s *SQLiteStore) GetEvents(filter models.EventFilter) ([]*models.Event, error) {
	query := "SELECT id, source_type, source_id, category, title, link, timestamp, metadata, created_at FROM events WHERE 1=1"
	args := []interface{}{}
	argIndex := 1

	// Add filters
	if len(filter.SourceTypes) > 0 {
		placeholders := make([]string, len(filter.SourceTypes))
		for i, sourceType := range filter.SourceTypes {
			placeholders[i] = fmt.Sprintf("?%d", argIndex)
			args = append(args, sourceType)
			argIndex++
		}
		query += fmt.Sprintf(" AND source_type IN (%s)", strings.Join(placeholders, ","))
	}

	if len(filter.Categories) > 0 {
		placeholders := make([]string, len(filter.Categories))
		for i, category := range filter.Categories {
			placeholders[i] = fmt.Sprintf("?%d", argIndex)
			args = append(args, category)
			argIndex++
		}
		query += fmt.Sprintf(" AND category IN (%s)", strings.Join(placeholders, ","))
	}

	if len(filter.Keywords) > 0 {
		keywordConditions := make([]string, len(filter.Keywords))
		for i, keyword := range filter.Keywords {
			keywordConditions[i] = fmt.Sprintf("(title LIKE ?%d OR metadata LIKE ?%d)", argIndex, argIndex+1)
			args = append(args, "%"+keyword+"%", "%"+keyword+"%")
			argIndex += 2
		}
		query += fmt.Sprintf(" AND (%s)", strings.Join(keywordConditions, " OR "))
	}

	if filter.StartTime != nil {
		query += fmt.Sprintf(" AND timestamp >= ?%d", argIndex)
		args = append(args, filter.StartTime)
		argIndex++
	}

	if filter.EndTime != nil {
		query += fmt.Sprintf(" AND timestamp <= ?%d", argIndex)
		args = append(args, filter.EndTime)
		argIndex++
	}

	// Order by timestamp descending (newest first)
	query += " ORDER BY timestamp DESC"

	// Add limit and offset
	if filter.Limit > 0 {
		query += fmt.Sprintf(" LIMIT ?%d", argIndex)
		args = append(args, filter.Limit)
		argIndex++
	}

	if filter.Offset > 0 {
		query += fmt.Sprintf(" OFFSET ?%d", argIndex)
		args = append(args, filter.Offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		var metadataJSON []byte

		err := rows.Scan(
			&event.ID,
			&event.SourceType,
			&event.SourceID,
			&event.Category,
			&event.Title,
			&event.Link,
			&event.Timestamp,
			&metadataJSON,
			&event.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		if metadataJSON != nil {
			event.Metadata = make(models.Metadata)
			if err := event.Metadata.Scan(metadataJSON); err != nil {
				return nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
			}
		}

		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return events, nil
}

// GetEventCount returns the total count of events matching the filter
func (s *SQLiteStore) GetEventCount(filter models.EventFilter) (int, error) {
	query := "SELECT COUNT(*) FROM events WHERE 1=1"
	args := []interface{}{}
	argIndex := 1

	// Add the same filters as GetEvents but only for counting
	if len(filter.SourceTypes) > 0 {
		placeholders := make([]string, len(filter.SourceTypes))
		for i, sourceType := range filter.SourceTypes {
			placeholders[i] = fmt.Sprintf("?%d", argIndex)
			args = append(args, sourceType)
			argIndex++
		}
		query += fmt.Sprintf(" AND source_type IN (%s)", strings.Join(placeholders, ","))
	}

	if len(filter.Categories) > 0 {
		placeholders := make([]string, len(filter.Categories))
		for i, category := range filter.Categories {
			placeholders[i] = fmt.Sprintf("?%d", argIndex)
			args = append(args, category)
			argIndex++
		}
		query += fmt.Sprintf(" AND category IN (%s)", strings.Join(placeholders, ","))
	}

	if len(filter.Keywords) > 0 {
		keywordConditions := make([]string, len(filter.Keywords))
		for i, keyword := range filter.Keywords {
			keywordConditions[i] = fmt.Sprintf("(title LIKE ?%d OR metadata LIKE ?%d)", argIndex, argIndex+1)
			args = append(args, "%"+keyword+"%", "%"+keyword+"%")
			argIndex += 2
		}
		query += fmt.Sprintf(" AND (%s)", strings.Join(keywordConditions, " OR "))
	}

	if filter.StartTime != nil {
		query += fmt.Sprintf(" AND timestamp >= ?%d", argIndex)
		args = append(args, filter.StartTime)
		argIndex++
	}

	if filter.EndTime != nil {
		query += fmt.Sprintf(" AND timestamp <= ?%d", argIndex)
		args = append(args, filter.EndTime)
	}

	var count int
	err := s.db.QueryRow(query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count events: %w", err)
	}

	return count, nil
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
} 