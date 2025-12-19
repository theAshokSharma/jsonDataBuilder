#!/bin/bash
# build.sh

echo "Building Docker images..."

# Build development image
docker build --target development -t json-schema-editor:dev .

# Build production image
docker build --target production -t json-schema-editor:prod .

echo "Build complete!"
