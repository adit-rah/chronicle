package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"event-aggregator/internal/dispatcher"
	"event-aggregator/internal/models"
	"event-aggregator/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// APIHandlers contains all the HTTP handlers
type APIHandlers struct {
	store      *storage.SQLiteStore
	dispatcher *dispatcher.EventDispatcher
	upgrader   websocket.Upgrader
}

// NewAPIHandlers creates a new API handlers instance
func NewAPIHandlers(store *storage.SQLiteStore, disp *dispatcher.EventDispatcher) *APIHandlers {
	return &APIHandlers{
		store:      store,
		dispatcher: disp,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins for now (restrict in production)
				return true
			},
		},
	}
}

// HealthHandler returns the health status of the service
func (h *APIHandlers) HealthHandler(c *gin.Context) {
	workers := h.dispatcher.GetActiveWorkers()
	clients := h.dispatcher.GetConnectedClients()

	c.JSON(http.StatusOK, gin.H{
		"status":            "healthy",
		"timestamp":         time.Now().UTC(),
		"active_workers":    len(workers),
		"connected_clients": clients,
		"workers":           workers,
	})
}

// GetEventsHandler retrieves events with filtering and pagination
func (h *APIHandlers) GetEventsHandler(c *gin.Context) {
	filter := h.parseEventFilter(c)

	events, err := h.store.GetEvents(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve events",
		})
		return
	}

	total, err := h.store.GetEventCount(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count events",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  total,
		"filter": filter,
	})
}

// WebSocketHandler handles WebSocket connections for real-time events
func (h *APIHandlers) WebSocketHandler(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to upgrade to WebSocket",
		})
		return
	}
	defer conn.Close()

	// Generate unique client ID
	clientID := uuid.New().String()
	
	// Add client to dispatcher
	eventChan := h.dispatcher.AddClient(clientID)
	defer h.dispatcher.RemoveClient(clientID)

	// Handle WebSocket communication
	go h.handleWebSocketReads(conn, clientID)
	h.handleWebSocketWrites(conn, eventChan)
}

// handleWebSocketReads handles incoming WebSocket messages (for filtering)
func (h *APIHandlers) handleWebSocketReads(conn *websocket.Conn, clientID string) {
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				// Log unexpected close
			}
			break
		}

		if messageType == websocket.TextMessage {
			// Handle filter updates from client
			var filterUpdate map[string]interface{}
			if err := json.Unmarshal(message, &filterUpdate); err == nil {
				// For now, just acknowledge the filter update
				// In a more advanced implementation, you could store per-client filters
				response := map[string]interface{}{
					"type": "filter_ack",
					"data": filterUpdate,
				}
				responseJSON, _ := json.Marshal(response)
				conn.WriteMessage(websocket.TextMessage, responseJSON)
			}
		}
	}
}

// handleWebSocketWrites handles outgoing WebSocket messages (events)
func (h *APIHandlers) handleWebSocketWrites(conn *websocket.Conn, eventChan <-chan *models.Event) {
	for event := range eventChan {
		message := map[string]interface{}{
			"type": "event",
			"data": event,
		}
		
		if err := conn.WriteJSON(message); err != nil {
			break
		}
	}
}

// GetSourceTypesHandler returns available source types
func (h *APIHandlers) GetSourceTypesHandler(c *gin.Context) {
	sourceTypes := []string{
		string(models.SourceTypeRSS),
		string(models.SourceTypeGitHub),
		string(models.SourceTypeWeather),
		string(models.SourceTypeJobs),
	}

	categories := []string{
		string(models.EventCategoryArticle),
		string(models.EventCategoryCommit),
		string(models.EventCategoryWeather),
		string(models.EventCategoryJobPosting),
		string(models.EventCategoryIssue),
		string(models.EventCategoryPullRequest),
		string(models.EventCategoryRelease),
	}

	c.JSON(http.StatusOK, gin.H{
		"source_types": sourceTypes,
		"categories":   categories,
	})
}

// GetStatsHandler returns statistics about events
func (h *APIHandlers) GetStatsHandler(c *gin.Context) {
	// Get event counts by source type
	sourceStats := make(map[string]int)
	for _, sourceType := range []models.SourceType{
		models.SourceTypeRSS,
		models.SourceTypeGitHub,
		models.SourceTypeWeather,
		models.SourceTypeJobs,
	} {
		filter := models.EventFilter{
			SourceTypes: []models.SourceType{sourceType},
		}
		count, err := h.store.GetEventCount(filter)
		if err == nil {
			sourceStats[string(sourceType)] = count
		}
	}

	// Get recent events count (last 24 hours)
	yesterday := time.Now().Add(-24 * time.Hour)
	recentFilter := models.EventFilter{
		StartTime: &yesterday,
	}
	recentCount, err := h.store.GetEventCount(recentFilter)
	if err != nil {
		recentCount = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"total_events":    h.getTotalEventCount(),
		"recent_events":   recentCount,
		"source_stats":    sourceStats,
		"active_workers":  len(h.dispatcher.GetActiveWorkers()),
		"connected_clients": h.dispatcher.GetConnectedClients(),
	})
}

// parseEventFilter parses query parameters into an EventFilter
func (h *APIHandlers) parseEventFilter(c *gin.Context) models.EventFilter {
	filter := models.EventFilter{
		Limit:  50, // Default limit
		Offset: 0,  // Default offset
	}

	// Parse source types
	if sourceTypesStr := c.Query("source_types"); sourceTypesStr != "" {
		sourceTypes := strings.Split(sourceTypesStr, ",")
		for _, st := range sourceTypes {
			filter.SourceTypes = append(filter.SourceTypes, models.SourceType(strings.TrimSpace(st)))
		}
	}

	// Parse categories
	if categoriesStr := c.Query("categories"); categoriesStr != "" {
		categories := strings.Split(categoriesStr, ",")
		for _, cat := range categories {
			filter.Categories = append(filter.Categories, models.EventCategory(strings.TrimSpace(cat)))
		}
	}

	// Parse keywords
	if keywordsStr := c.Query("keywords"); keywordsStr != "" {
		keywords := strings.Split(keywordsStr, ",")
		for _, keyword := range keywords {
			if trimmed := strings.TrimSpace(keyword); trimmed != "" {
				filter.Keywords = append(filter.Keywords, trimmed)
			}
		}
	}

	// Parse time range
	if startTimeStr := c.Query("start_time"); startTimeStr != "" {
		if startTime, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			filter.StartTime = &startTime
		}
	}

	if endTimeStr := c.Query("end_time"); endTimeStr != "" {
		if endTime, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			filter.EndTime = &endTime
		}
	}

	// Parse pagination
	if limitStr := c.Query("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 1000 {
			filter.Limit = limit
		}
	}

	if offsetStr := c.Query("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil && offset >= 0 {
			filter.Offset = offset
		}
	}

	return filter
}

// getTotalEventCount gets the total number of events
func (h *APIHandlers) getTotalEventCount() int {
	count, err := h.store.GetEventCount(models.EventFilter{})
	if err != nil {
		return 0
	}
	return count
}

// Event Listener Handlers

// GetListenersHandler retrieves all event listeners
func (h *APIHandlers) GetListenersHandler(c *gin.Context) {
	listeners, err := h.store.GetListeners()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve listeners",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"listeners": listeners,
	})
}

// CreateListenerHandler creates a new event listener
func (h *APIHandlers) CreateListenerHandler(c *gin.Context) {
	var listener models.EventListener
	if err := c.ShouldBindJSON(&listener); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	if err := h.store.CreateListener(&listener); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create listener",
		})
		return
	}

	// Reload workers to include the new listener
	if err := h.dispatcher.ReloadListeners(); err != nil {
		log.Printf("Failed to reload listeners after creation: %v", err)
	}

	c.JSON(http.StatusCreated, listener)
}

// UpdateListenerHandler updates an existing event listener
func (h *APIHandlers) UpdateListenerHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid listener ID",
		})
		return
	}

	var listener models.EventListener
	if err := c.ShouldBindJSON(&listener); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	listener.ID = id
	if err := h.store.UpdateListener(&listener); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update listener",
		})
		return
	}

	// Reload workers to apply the updated listener configuration
	if err := h.dispatcher.ReloadListeners(); err != nil {
		log.Printf("Failed to reload listeners after update: %v", err)
	}

	c.JSON(http.StatusOK, listener)
}

// DeleteListenerHandler deletes an event listener
func (h *APIHandlers) DeleteListenerHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid listener ID",
		})
		return
	}

	if err := h.store.DeleteListener(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete listener",
		})
		return
	}

	// Reload workers to remove the deleted listener
	if err := h.dispatcher.ReloadListeners(); err != nil {
		log.Printf("Failed to reload listeners after deletion: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Listener deleted successfully",
	})
}

// Event Tag Handlers

// GetTagsHandler retrieves all event tags
func (h *APIHandlers) GetTagsHandler(c *gin.Context) {
	tags, err := h.store.GetTags()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve tags",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tags": tags,
	})
}

// CreateTagHandler creates a new event tag
func (h *APIHandlers) CreateTagHandler(c *gin.Context) {
	var tag models.EventTag
	if err := c.ShouldBindJSON(&tag); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	if err := h.store.CreateTag(&tag); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create tag",
		})
		return
	}

	c.JSON(http.StatusCreated, tag)
}

// DeleteTagHandler deletes an event tag
func (h *APIHandlers) DeleteTagHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid tag ID",
		})
		return
	}

	if err := h.store.DeleteTag(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete tag",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Tag deleted successfully",
	})
} 