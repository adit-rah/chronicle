package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"event-aggregator/internal/config"
	"event-aggregator/internal/dispatcher"
	"event-aggregator/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Server represents the HTTP server
type Server struct {
	config     *config.Config
	handlers   *APIHandlers
	dispatcher *dispatcher.EventDispatcher
	server     *http.Server
}

// NewServer creates a new HTTP server
func NewServer(cfg *config.Config, store *storage.SQLiteStore, disp *dispatcher.EventDispatcher) *Server {
	handlers := NewAPIHandlers(store, disp)
	
	return &Server{
		config:     cfg,
		handlers:   handlers,
		dispatcher: disp,
	}
}

// Start starts the HTTP server
func (s *Server) Start(ctx context.Context) error {
	router := s.setupRouter()
	
	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Server.Port),
		Handler:      router,
		ReadTimeout:  s.config.Server.ReadTimeout,
		WriteTimeout: s.config.Server.WriteTimeout,
	}

	log.Printf("Starting HTTP server on port %d", s.config.Server.Port)
	
	// Start server in a goroutine
	go func() {
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	return nil
}

// Stop gracefully stops the HTTP server
func (s *Server) Stop(ctx context.Context) error {
	log.Println("Stopping HTTP server")
	
	if s.server != nil {
		return s.server.Shutdown(ctx)
	}
	
	return nil
}

// setupRouter configures the Gin router with all routes and middleware
func (s *Server) setupRouter() *gin.Engine {
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)
	
	router := gin.New()
	
	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	
	// CORS configuration
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	router.Use(cors.New(corsConfig))

	// API routes
	api := router.Group("/api/v1")
	{
		// Health check
		api.GET("/health", s.handlers.HealthHandler)
		
		// Events
		api.GET("/events", s.handlers.GetEventsHandler)
		
		// Source types and metadata
		api.GET("/source-types", s.handlers.GetSourceTypesHandler)
		
		// Statistics
		api.GET("/stats", s.handlers.GetStatsHandler)
		
		// WebSocket endpoint
		api.GET("/ws", s.handlers.WebSocketHandler)
	}

	// Serve static files (for frontend)
	router.Static("/static", "./web/dist")
	router.StaticFile("/", "./web/dist/index.html")
	router.StaticFile("/favicon.ico", "./web/dist/favicon.ico")
	
	// Catch-all for SPA routing
	router.NoRoute(func(c *gin.Context) {
		// If it's an API request, return 404
		if gin.IsDebugging() || c.Request.URL.Path[:4] == "/api" {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Route not found",
			})
			return
		}
		
		// Otherwise, serve the SPA
		c.File("./web/dist/index.html")
	})

	return router
}

// AddCustomRoutes allows adding custom routes for extensions
func (s *Server) AddCustomRoutes(router *gin.Engine) {
	// This method can be used for adding custom routes in the future
	// For example, authentication routes, admin routes, etc.
} 