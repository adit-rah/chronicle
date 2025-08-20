.PHONY: help build run clean test docker-build docker-run docker-stop dev frontend-dev backend-dev

# Default target
help:
	@echo "Event Aggregator - Available commands:"
	@echo "  build         - Build the Go backend"
	@echo "  run           - Run the backend locally"
	@echo "  test          - Run tests"
	@echo "  clean         - Clean build artifacts"
	@echo "  dev           - Run in development mode"
	@echo "  frontend-dev  - Run frontend development server"
	@echo "  backend-dev   - Run backend development server"
	@echo "  docker-build  - Build Docker images"
	@echo "  docker-run    - Run with Docker Compose"
	@echo "  docker-stop   - Stop Docker containers"
	@echo "  deps          - Install Go dependencies"

# Go commands
build:
	go build -o bin/event-aggregator ./cmd/server

run:
	go run ./cmd/server

test:
	go test ./...

clean:
	rm -rf bin/
	rm -rf web/dist/
	rm -rf data/

deps:
	go mod download
	go mod tidy

# Development
dev: deps
	go run ./cmd/server -config config.yaml

backend-dev:
	go run ./cmd/server -config config.yaml

frontend-dev:
	cd web && npm install && npm run dev

# Docker commands
docker-build:
	docker-compose build

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-restart: docker-stop docker-run

# Database commands
db-reset:
	rm -f data/events.db
	mkdir -p data

# Setup commands
setup: deps
	mkdir -p data
	cp env.example .env
	@echo "Setup complete! Please edit .env file with your API keys."

install-frontend-deps:
	cd web && npm install 