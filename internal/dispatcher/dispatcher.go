package dispatcher

import (
	"context"
	"fmt"
	"log"
	"sync"

	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
	"event-aggregator/internal/storage"
	"event-aggregator/internal/workers"
)

// EventDispatcher manages workers and distributes events
type EventDispatcher struct {
	config      *config.Config
	store       *storage.SQLiteStore
	factory     *workers.WorkerFactory
	eventChan   chan *models.Event
	clients     map[string]chan *models.Event
	clientsMux  sync.RWMutex
	workers     []workers.Worker
	workerGroup sync.WaitGroup
}

// NewEventDispatcher creates a new event dispatcher
func NewEventDispatcher(cfg *config.Config, store *storage.SQLiteStore) *EventDispatcher {
	return &EventDispatcher{
		config:    cfg,
		store:     store,
		factory:   workers.NewWorkerFactory(),
		eventChan: make(chan *models.Event, 100), // Buffered channel
		clients:   make(map[string]chan *models.Event),
	}
}

// Start initializes and starts all workers and the event processing loop
func (d *EventDispatcher) Start(ctx context.Context) error {
	log.Println("Starting Event Dispatcher")

	// Create and start workers for enabled sources
	for _, sourceConfig := range d.config.Sources {
		if !sourceConfig.Enabled {
			log.Printf("Skipping disabled source: %s", sourceConfig.Name)
			continue
		}

		worker, err := d.factory.CreateWorker(sourceConfig)
		if err != nil {
			log.Printf("Failed to create worker for %s: %v", sourceConfig.Name, err)
			continue
		}

		d.workers = append(d.workers, worker)
		d.workerGroup.Add(1)

		// Start worker in a goroutine
		go func(w workers.Worker) {
			defer d.workerGroup.Done()
			if err := w.Start(ctx, d.eventChan); err != nil && err != context.Canceled {
				log.Printf("Worker %s stopped with error: %v", w.GetName(), err)
			}
		}(worker)

		log.Printf("Started worker: %s (%s)", worker.GetName(), worker.GetSourceType())
	}

	// Start event processing loop
	go d.processEvents(ctx)

	log.Printf("Event Dispatcher started with %d workers", len(d.workers))
	return nil
}

// Stop gracefully stops all workers and the dispatcher
func (d *EventDispatcher) Stop() {
	log.Println("Stopping Event Dispatcher")
	
	// Close event channel to signal stop
	close(d.eventChan)
	
	// Wait for all workers to stop
	d.workerGroup.Wait()
	
	// Close all client connections
	d.clientsMux.Lock()
	for clientID, clientChan := range d.clients {
		close(clientChan)
		delete(d.clients, clientID)
	}
	d.clientsMux.Unlock()
	
	log.Println("Event Dispatcher stopped")
}

// processEvents handles incoming events from workers
func (d *EventDispatcher) processEvents(ctx context.Context) {
	log.Println("Starting event processing loop")
	
	for {
		select {
		case <-ctx.Done():
			log.Println("Event processing loop stopping")
			return
		case event, ok := <-d.eventChan:
			if !ok {
				log.Println("Event channel closed, stopping event processing")
				return
			}
			
			if err := d.handleEvent(event); err != nil {
				log.Printf("Error handling event: %v", err)
			}
		}
	}
}

// handleEvent processes a single event
func (d *EventDispatcher) handleEvent(event *models.Event) error {
	// Store event in database
	if err := d.store.StoreEvent(event); err != nil {
		return fmt.Errorf("failed to store event: %w", err)
	}

	// Only broadcast if the event was actually stored (not a duplicate)
	if event.ID > 0 {
		log.Printf("New event stored: %s - %s", event.SourceType, event.Title)
		d.broadcastEvent(event)
	}

	return nil
}

// broadcastEvent sends an event to all connected WebSocket clients
func (d *EventDispatcher) broadcastEvent(event *models.Event) {
	d.clientsMux.RLock()
	defer d.clientsMux.RUnlock()

	for clientID, clientChan := range d.clients {
		select {
		case clientChan <- event:
			// Event sent successfully
		default:
			// Client channel is full or closed, remove it
			log.Printf("Removing unresponsive client: %s", clientID)
			close(clientChan)
			delete(d.clients, clientID)
		}
	}
}

// AddClient adds a new WebSocket client for event broadcasting
func (d *EventDispatcher) AddClient(clientID string) <-chan *models.Event {
	d.clientsMux.Lock()
	defer d.clientsMux.Unlock()

	clientChan := make(chan *models.Event, 10) // Buffered channel
	d.clients[clientID] = clientChan
	
	log.Printf("Added WebSocket client: %s", clientID)
	return clientChan
}

// RemoveClient removes a WebSocket client
func (d *EventDispatcher) RemoveClient(clientID string) {
	d.clientsMux.Lock()
	defer d.clientsMux.Unlock()

	if clientChan, exists := d.clients[clientID]; exists {
		close(clientChan)
		delete(d.clients, clientID)
		log.Printf("Removed WebSocket client: %s", clientID)
	}
}

// GetConnectedClients returns the number of connected clients
func (d *EventDispatcher) GetConnectedClients() int {
	d.clientsMux.RLock()
	defer d.clientsMux.RUnlock()
	return len(d.clients)
}

// GetActiveWorkers returns information about active workers
func (d *EventDispatcher) GetActiveWorkers() []WorkerInfo {
	var workers []WorkerInfo
	for _, worker := range d.workers {
		workers = append(workers, WorkerInfo{
			Name:       worker.GetName(),
			SourceType: string(worker.GetSourceType()),
		})
	}
	return workers
}

// WorkerInfo represents information about a worker
type WorkerInfo struct {
	Name       string `json:"name"`
	SourceType string `json:"source_type"`
} 