package config

import (
	"fmt"
	"os"
	"time"

	"event-aggregator/internal/models"
	"gopkg.in/yaml.v3"
)

// Config represents the main application configuration
type Config struct {
	Database DatabaseConfig `yaml:"database"`
	Server   ServerConfig   `yaml:"server"`
	Sources  []SourceConfig `yaml:"sources"`
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Path string `yaml:"path"`
}

// ServerConfig holds server settings
type ServerConfig struct {
	Port         int           `yaml:"port"`
	ReadTimeout  time.Duration `yaml:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout"`
}

// SourceConfig represents configuration for a data source
type SourceConfig struct {
	Type     models.SourceType `yaml:"type"`
	Name     string            `yaml:"name"`
	Enabled  bool              `yaml:"enabled"`
	Interval time.Duration     `yaml:"interval"`
	Config   map[string]interface{} `yaml:"config"`
}

// RSSConfig represents RSS-specific configuration
type RSSConfig struct {
	URL string `yaml:"url"`
}

// GitHubConfig represents GitHub-specific configuration
type GitHubConfig struct {
	Owner      string `yaml:"owner"`
	Repository string `yaml:"repository"`
	Token      string `yaml:"token"` // Will be read from environment
}

// WeatherConfig represents weather-specific configuration
type WeatherConfig struct {
	City   string `yaml:"city"`
	APIKey string `yaml:"api_key"` // Will be read from environment
}

// JobsConfig represents jobs-specific configuration
type JobsConfig struct {
	CompanyURL string   `yaml:"company_url"`
	Keywords   []string `yaml:"keywords"`
	Location   string   `yaml:"location"`
}

// LoadConfig loads configuration from a YAML file
func LoadConfig(filename string) (*Config, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Set defaults
	if config.Server.Port == 0 {
		config.Server.Port = 8080
	}
	if config.Server.ReadTimeout == 0 {
		config.Server.ReadTimeout = 10 * time.Second
	}
	if config.Server.WriteTimeout == 0 {
		config.Server.WriteTimeout = 10 * time.Second
	}
	if config.Database.Path == "" {
		config.Database.Path = "./data/events.db"
	}

	// Inject environment variables for sensitive data
	for i := range config.Sources {
		source := &config.Sources[i]
		if source.Type == models.SourceTypeGitHub {
			if token, exists := os.LookupEnv("GITHUB_TOKEN"); exists {
				if source.Config == nil {
					source.Config = make(map[string]interface{})
				}
				source.Config["token"] = token
			}
		}
		if source.Type == models.SourceTypeWeather {
			if apiKey, exists := os.LookupEnv("WEATHER_API_KEY"); exists {
				if source.Config == nil {
					source.Config = make(map[string]interface{})
				}
				source.Config["api_key"] = apiKey
			}
		}
	}

	return &config, nil
}

// GetSourceConfig extracts and validates source-specific configuration
func (s *SourceConfig) GetRSSConfig() (*RSSConfig, error) {
	var rssConfig RSSConfig
	if err := s.unmarshalConfig(&rssConfig); err != nil {
		return nil, fmt.Errorf("invalid RSS config: %w", err)
	}
	if rssConfig.URL == "" {
		return nil, fmt.Errorf("RSS config missing required field: url")
	}
	return &rssConfig, nil
}

func (s *SourceConfig) GetGitHubConfig() (*GitHubConfig, error) {
	var githubConfig GitHubConfig
	if err := s.unmarshalConfig(&githubConfig); err != nil {
		return nil, fmt.Errorf("invalid GitHub config: %w", err)
	}
	if githubConfig.Owner == "" || githubConfig.Repository == "" {
		return nil, fmt.Errorf("GitHub config missing required fields: owner, repository")
	}
	return &githubConfig, nil
}

func (s *SourceConfig) GetWeatherConfig() (*WeatherConfig, error) {
	var weatherConfig WeatherConfig
	if err := s.unmarshalConfig(&weatherConfig); err != nil {
		return nil, fmt.Errorf("invalid Weather config: %w", err)
	}
	if weatherConfig.City == "" {
		return nil, fmt.Errorf("Weather config missing required field: city")
	}
	return &weatherConfig, nil
}

func (s *SourceConfig) GetJobsConfig() (*JobsConfig, error) {
	var jobsConfig JobsConfig
	if err := s.unmarshalConfig(&jobsConfig); err != nil {
		return nil, fmt.Errorf("invalid Jobs config: %w", err)
	}
	if jobsConfig.CompanyURL == "" {
		return nil, fmt.Errorf("Jobs config missing required field: company_url")
	}
	return &jobsConfig, nil
}

func (s *SourceConfig) unmarshalConfig(target interface{}) error {
	configData, err := yaml.Marshal(s.Config)
	if err != nil {
		return err
	}
	return yaml.Unmarshal(configData, target)
} 