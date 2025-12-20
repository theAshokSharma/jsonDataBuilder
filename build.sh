#!/bin/bash
# build.sh

echo "Building Docker images..."

# Build development image
docker build --target development -t json-data-builder:dev .

# Build production image
docker build --target production -t json-data-builder:prod .

echo "Build complete!"
