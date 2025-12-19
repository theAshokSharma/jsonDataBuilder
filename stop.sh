#!/bin/bash
echo "Stopping all containers..."
docker-compose -f docker-compose.yml down
echo "Containers stopped"