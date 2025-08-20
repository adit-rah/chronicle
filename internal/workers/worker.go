package workers

import (
	"context"
	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
	"fmt"
)

// Worker defines the interface that all source workers must implement
type Worker interface {
	// Start begins the worker's polling loop
	Start(ctx context.Context, eventChan chan<- *models.Event) error
	
	// GetSourceType returns the type of source this worker handles
	GetSourceType() models.SourceType
	
	// GetName returns a human-readable name for this worker instance
	GetName() string
}

// WorkerFactory creates workers based on source configuration
type WorkerFactory struct{}

// NewWorkerFactory creates a new worker factory
func NewWorkerFactory() *WorkerFactory {
	return &WorkerFactory{}
}

// CreateWorker creates a worker based on the source configuration
func (f *WorkerFactory) CreateWorker(sourceConfig config.SourceConfig) (Worker, error) {
	switch sourceConfig.Type {
	case models.SourceTypeRSS:
		return NewRSSWorker(sourceConfig)
	case models.SourceTypeGitHub:
		return NewGitHubWorker(sourceConfig)
	case models.SourceTypeWeather:
		return NewWeatherWorker(sourceConfig)
	case models.SourceTypeJobs:
		return NewJobsWorker(sourceConfig)
	default:
		return nil, ErrUnsupportedSourceType
	}
}

// Common errors
var (
	ErrUnsupportedSourceType = fmt.Errorf("unsupported source type")
) 