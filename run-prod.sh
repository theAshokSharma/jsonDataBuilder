#!/bin/bash
echo "Starting production environment..."
echo "Note: If port 8080 is busy, you may need to use a different port"

# Stop any existing prod container
docker-compose -f docker-compose.yml stop prod 2>/dev/null

# Start production environment
docker-compose -f docker-compose.yml up prod -d

# Wait a moment for container to start
sleep 2

# Show running status
echo "========================================="
echo "Production server running on:"
echo "  http://localhost:8080"
echo ""
echo "To view logs: docker-compose logs -f prod"
echo "To stop: docker-compose stop prod"
echo "========================================="