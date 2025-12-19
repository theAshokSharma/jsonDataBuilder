#!/bin/bash
echo "Starting development environment..."
echo "Note: If port 8080 is busy, you may need to use a different port"

# Stop any existing dev container
docker-compose -f docker-compose.yml stop dev 2>/dev/null

# Start development environment
docker-compose -f docker-compose.yml up dev -d

# Wait a moment for container to start
sleep 2

# Show running status
echo "========================================="
echo "Development server running on:"
echo "  http://localhost:8080"
echo ""
echo "To view logs: docker-compose logs -f dev"
echo "To stop: docker-compose stop dev"
echo "========================================="