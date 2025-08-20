# Event Stream Dashboard

A self-hosted application that aggregates different information streams (news, GitHub activity, weather updates, job postings, etc.) into a single, real-time dashboard.

## Features

- **Multi-Source Support**: RSS feeds, GitHub repositories, weather data, and job postings
- **Real-Time Updates**: WebSocket-based live event streaming
- **Configurable Sources**: Easy YAML configuration for adding/removing sources
- **Event Deduplication**: Automatic detection and prevention of duplicate events
- **Modern Web Interface**: React-based dashboard with filtering and search
- **Dockerized Deployment**: Simple deployment with Docker Compose
- **Extensible Architecture**: Modular design for easy addition of new sources

## Architecture

### Backend (Go)
- **Event Workers**: Concurrent workers for each source type (RSS, GitHub, Weather, Jobs)
- **Central Dispatcher**: Coordinates event processing and distribution
- **SQLite Storage**: Persistent event storage with deduplication
- **REST API**: Event querying, filtering, and statistics
- **WebSocket API**: Real-time event streaming to frontend

### Frontend (React)
- **Timeline View**: Chronological event display
- **Real-Time Updates**: Live events via WebSocket connection
- **Filtering**: Filter by source type, category, keywords, and time range
- **Responsive Design**: Works on desktop and mobile devices

## Quick Start

### Option 1: Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd event-aggregator
   ```

2. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```

3. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Dashboard: http://localhost
   - API: http://localhost:8080/api/v1/health

### Option 2: Local Development

1. **Prerequisites**:
   - Go 1.21 or later
   - Node.js 18 or later
   - SQLite

2. **Backend setup**:
   ```bash
   # Install Go dependencies
   make deps
   
   # Run backend
   make backend-dev
   ```

3. **Frontend setup** (in a new terminal):
   ```bash
   # Install Node.js dependencies
   make install-frontend-deps
   
   # Run frontend development server
   make frontend-dev
   ```

4. **Access the application**:
   - Dashboard: http://localhost:3000
   - API: http://localhost:8080/api/v1/health

## Configuration

### Main Configuration (config.yaml)

```yaml
database:
  path: "./data/events.db"

server:
  port: 8080
  read_timeout: 10s
  write_timeout: 10s

sources:
  # RSS Feed Example
  - type: rss
    name: "Hacker News"
    enabled: true
    interval: 15m
    config:
      url: "https://hnrss.org/frontpage"

  # GitHub Repository Example
  - type: github
    name: "Go Repository"
    enabled: true
    interval: 10m
    config:
      owner: "golang"
      repository: "go"

  # Weather Example
  - type: weather
    name: "San Francisco Weather"
    enabled: true
    interval: 1h
    config:
      city: "San Francisco"

  # Jobs Example
  - type: jobs
    name: "Company Jobs"
    enabled: false
    interval: 2h
    config:
      company_url: "https://company.com/careers/feed"
      keywords: ["software", "engineer", "developer"]
      location: "San Francisco"
```

### Environment Variables (.env)

```bash
# GitHub API Token (optional, increases rate limits)
GITHUB_TOKEN=your_github_token_here

# OpenWeatherMap API Key (required for weather)
WEATHER_API_KEY=your_weather_api_key_here
```

#### Getting API Keys

1. **GitHub Token** (optional):
   - Go to https://github.com/settings/tokens
   - Generate a new token with `public_repo` scope
   - Add to `.env` file

2. **OpenWeatherMap API Key** (required for weather):
   - Sign up at https://openweathermap.org/api
   - Get your free API key
   - Add to `.env` file

## Source Types

### RSS Sources
```yaml
- type: rss
  name: "News Feed"
  enabled: true
  interval: 30m
  config:
    url: "https://example.com/feed.xml"
```

### GitHub Sources
```yaml
- type: github
  name: "Repository Activity"
  enabled: true
  interval: 10m
  config:
    owner: "username"
    repository: "repository-name"
```

### Weather Sources
```yaml
- type: weather
  name: "City Weather"
  enabled: true
  interval: 1h
  config:
    city: "New York"
```

### Job Sources
```yaml
- type: jobs
  name: "Job Listings"
  enabled: true
  interval: 4h
  config:
    company_url: "https://company.com/careers/feed"
    keywords: ["intern", "junior", "remote"]
    location: "Remote"
```

## API Endpoints

### REST API

- `GET /api/v1/health` - Health check and system status
- `GET /api/v1/events` - Get events with filtering
- `GET /api/v1/stats` - Get system statistics
- `GET /api/v1/source-types` - Get available source types

### WebSocket API

- `GET /api/v1/ws` - WebSocket connection for real-time events

### Query Parameters for /events

- `source_types` - Filter by source types (comma-separated)
- `categories` - Filter by event categories (comma-separated)
- `keywords` - Search keywords (comma-separated)
- `start_time` - Start time filter (RFC3339 format)
- `end_time` - End time filter (RFC3339 format)
- `limit` - Number of events to return (default: 50, max: 1000)
- `offset` - Pagination offset

Example:
```
GET /api/v1/events?source_types=rss,github&keywords=golang&limit=20
```

## Development

### Available Make Commands

```bash
make help           # Show all available commands
make setup          # Initial project setup
make dev            # Run in development mode
make build          # Build the Go backend
make test           # Run tests
make clean          # Clean build artifacts
make docker-build   # Build Docker images
make docker-run     # Run with Docker Compose
make docker-stop    # Stop Docker containers
```

### Project Structure

```
event-aggregator/
├── cmd/server/          # Application entry point
├── internal/
│   ├── api/            # HTTP handlers and routing
│   ├── config/         # Configuration management
│   ├── dispatcher/     # Event dispatcher
│   ├── models/         # Data models
│   ├── storage/        # Database layer
│   └── workers/        # Source workers
├── web/                # React frontend
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── dist/          # Built files
├── config.yaml        # Main configuration
├── docker-compose.yml # Docker orchestration
└── Dockerfile         # Backend container
```

### Adding New Sources

1. **Implement the Worker interface**:
   ```go
   type Worker interface {
       Start(ctx context.Context, eventChan chan<- *models.Event) error
       GetSourceType() models.SourceType
       GetName() string
   }
   ```

2. **Add source type to models**:
   ```go
   const SourceTypeNewSource SourceType = "new_source"
   ```

3. **Register in worker factory**:
   ```go
   case models.SourceTypeNewSource:
       return NewSourceWorker(sourceConfig)
   ```

4. **Update configuration schema** in `config/config.go`

## Deployment

### Production Deployment

1. **Set up environment**:
   ```bash
   cp env.example .env
   # Configure production API keys
   ```

2. **Deploy with Docker Compose**:
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

3. **Configure reverse proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:80;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       location /api/v1/ws {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

### Environment Variables for Production

```bash
# Security
GITHUB_TOKEN=production_github_token
WEATHER_API_KEY=production_weather_key

# Optional: Database path (if using external volume)
DB_PATH=/data/events.db
```

## Monitoring

### Health Checks

The application provides health check endpoints:

- **HTTP**: `GET /api/v1/health`
- **Docker**: Built-in health check in Dockerfile

### Logs

View logs with Docker Compose:
```bash
docker-compose logs -f
```

### Metrics

The `/api/v1/stats` endpoint provides:
- Total events count
- Recent events (last 24 hours)
- Events by source type
- Active workers count
- Connected WebSocket clients

## Troubleshooting

### Common Issues

1. **Database locked error**:
   ```bash
   # Stop application, remove lock file
   rm data/events.db-wal data/events.db-shm
   ```

2. **Port already in use**:
   ```bash
   # Change ports in docker-compose.yml or config.yaml
   ```

3. **API rate limits**:
   - Add GitHub token to increase limits
   - Increase worker intervals in config

4. **WebSocket connection failed**:
   - Check firewall settings
   - Verify WebSocket proxy configuration

### Debug Mode

Run with debug logging:
```bash
LOG_LEVEL=debug make dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

### Code Structure Guidelines

- **Workers**: Keep stateless, implement deduplication
- **API**: Follow REST conventions
- **Frontend**: Use TypeScript, keep components small
- **Config**: Add validation for new source types

## License

MIT License - see LICENSE file for details.

## Future Enhancements

- [ ] User authentication and personal dashboards
- [ ] Email/Slack/Discord notifications
- [ ] Multi-column layout (TweetDeck style)
- [ ] Advanced filtering with boolean operators
- [ ] Event analytics and trends
- [ ] API key management UI
- [ ] Plugin system for custom sources
- [ ] Mobile app
