package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"event-aggregator/internal/api"
	"event-aggregator/internal/config"
	"event-aggregator/internal/dispatcher"
	"event-aggregator/internal/storage"
)

func main() {
	// Parse command line flags
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	// Load configuration
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Starting Event Aggregator with config: %s", *configPath)

	// Initialize storage
	store, err := storage.NewSQLiteStore(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer store.Close()

	log.Printf("Database initialized at: %s", cfg.Database.Path)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize dispatcher
	disp := dispatcher.NewEventDispatcher(cfg, store)

	// Start dispatcher
	if err := disp.Start(ctx); err != nil {
		log.Fatalf("Failed to start dispatcher: %v", err)
	}

	// Initialize and start HTTP server
	server := api.NewServer(cfg, store, disp)
	if err := server.Start(ctx); err != nil {
		log.Fatalf("Failed to start HTTP server: %v", err)
	}

	log.Printf("Event Aggregator started successfully on port %d", cfg.Server.Port)
	log.Printf("WebSocket endpoint: ws://localhost:%d/api/v1/ws", cfg.Server.Port)
	log.Printf("Health check: http://localhost:%d/api/v1/health", cfg.Server.Port)

	// Wait for interrupt signal for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	log.Println("Received shutdown signal, starting graceful shutdown...")

	// Cancel context to signal all components to stop
	cancel()

	// Create a timeout context for shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Stop HTTP server
	if err := server.Stop(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	// Stop dispatcher
	disp.Stop()

	log.Println("Event Aggregator shut down successfully")
}
