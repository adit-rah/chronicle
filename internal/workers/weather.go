package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"event-aggregator/internal/config"
	"event-aggregator/internal/models"
)

// WeatherWorker handles weather updates polling
type WeatherWorker struct {
	name     string
	config   *config.WeatherConfig
	interval time.Duration
	client   *http.Client
}

// WeatherResponse represents the OpenWeatherMap API response
type WeatherResponse struct {
	Weather []struct {
		Main        string `json:"main"`
		Description string `json:"description"`
	} `json:"weather"`
	Main struct {
		Temp      float64 `json:"temp"`
		FeelsLike float64 `json:"feels_like"`
		Humidity  int     `json:"humidity"`
		Pressure  int     `json:"pressure"`
	} `json:"main"`
	Wind struct {
		Speed float64 `json:"speed"`
		Deg   int     `json:"deg"`
	} `json:"wind"`
	Name string `json:"name"`
	Sys  struct {
		Country string `json:"country"`
	} `json:"sys"`
}

// NewWeatherWorker creates a new Weather worker
func NewWeatherWorker(sourceConfig config.SourceConfig) (*WeatherWorker, error) {
	weatherConfig, err := sourceConfig.GetWeatherConfig()
	if err != nil {
		return nil, err
	}

	return &WeatherWorker{
		name:     sourceConfig.Name,
		config:   weatherConfig,
		interval: sourceConfig.Interval,
		client:   &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// GetSourceType returns the source type
func (w *WeatherWorker) GetSourceType() models.SourceType {
	return models.SourceTypeWeather
}

// GetName returns the worker name
func (w *WeatherWorker) GetName() string {
	return w.name
}

// InitializeLastSeen initializes the lastSeen map with existing events from database
func (w *WeatherWorker) InitializeLastSeen(existingEvents []string) {
	// Weather worker doesn't use lastSeen tracking since weather data is always current
	// This is a no-op implementation to satisfy the Worker interface
}

// Start begins the Weather polling loop
func (w *WeatherWorker) Start(ctx context.Context, eventChan chan<- *models.Event) error {
	log.Printf("Starting Weather worker: %s (City: %s, Interval: %v)", 
		w.name, w.config.City, w.interval)

	// Initial fetch
	if err := w.fetchAndProcess(eventChan); err != nil {
		log.Printf("Weather worker %s initial fetch error: %v", w.name, err)
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Weather worker %s stopping", w.name)
			return ctx.Err()
		case <-ticker.C:
			if err := w.fetchAndProcess(eventChan); err != nil {
				log.Printf("Weather worker %s fetch error: %v", w.name, err)
			}
		}
	}
}

// fetchAndProcess fetches weather data and creates an event
func (w *WeatherWorker) fetchAndProcess(eventChan chan<- *models.Event) error {
	if w.config.APIKey == "" {
		return fmt.Errorf("weather API key not configured")
	}

	// Construct OpenWeatherMap API URL
	url := fmt.Sprintf("https://api.openweathermap.org/data/2.5/weather?q=%s&appid=%s&units=metric",
		w.config.City, w.config.APIKey)

	resp, err := w.client.Get(url)
	if err != nil {
		return fmt.Errorf("failed to fetch weather data: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("weather API returned status %d", resp.StatusCode)
	}

	var weatherResp WeatherResponse
	if err := json.NewDecoder(resp.Body).Decode(&weatherResp); err != nil {
		return fmt.Errorf("failed to decode weather response: %w", err)
	}

	// Create event from weather data
	event := w.createWeatherEvent(&weatherResp)

	// Send event
	select {
	case eventChan <- event:
		log.Printf("Weather worker %s: sent weather update for %s", w.name, w.config.City)
	case <-time.After(5 * time.Second):
		log.Printf("Weather worker %s: timeout sending event", w.name)
	}

	return nil
}

// createWeatherEvent creates an event from weather data
func (w *WeatherWorker) createWeatherEvent(data *WeatherResponse) *models.Event {
	now := time.Now()
	
	// Create a unique source ID based on timestamp (rounded to nearest hour)
	// This ensures we don't spam with weather updates but still get regular updates
	sourceID := fmt.Sprintf("%s-%s", w.config.City, now.Format("2006-01-02-15"))

	// Build title with main weather info
	title := fmt.Sprintf("Weather in %s: %.1f°C", data.Name, data.Main.Temp)
	if len(data.Weather) > 0 {
		title = fmt.Sprintf("Weather in %s: %.1f°C, %s", 
			data.Name, data.Main.Temp, data.Weather[0].Description)
	}

	// Create comprehensive metadata
	metadata := models.Metadata{
		"city":        data.Name,
		"country":     data.Sys.Country,
		"temperature": data.Main.Temp,
		"feels_like":  data.Main.FeelsLike,
		"humidity":    data.Main.Humidity,
		"pressure":    data.Main.Pressure,
		"wind_speed":  data.Wind.Speed,
		"wind_deg":    data.Wind.Deg,
	}

	if len(data.Weather) > 0 {
		metadata["weather_main"] = data.Weather[0].Main
		metadata["weather_description"] = data.Weather[0].Description
	}

	return &models.Event{
		SourceType: models.SourceTypeWeather,
		SourceID:   sourceID,
		Category:   models.EventCategoryWeather,
		Title:      title,
		Link:       fmt.Sprintf("https://openweathermap.org/city/%s", w.config.City),
		Timestamp:  now,
		Metadata:   metadata,
	}
} 