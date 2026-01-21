#!/bin/bash

# FlowBotomat - Manual Deploy Script
# Usage: ./deploy.sh

set -e

echo "=========================================="
echo "FlowBotomat - Deployment"
echo "=========================================="

# Pull latest changes
echo "[1/4] Pulling latest changes..."
git pull origin main

# Stop containers
echo "[2/4] Stopping containers..."
docker-compose down

# Rebuild and start
echo "[3/4] Building and starting containers..."
docker-compose up -d --build

# Show status
echo "[4/4] Checking status..."
docker-compose ps

echo ""
echo "=========================================="
echo "✅ Deployment completed!"
echo "=========================================="
echo ""
echo "Frontend: http://localhost:3748"
echo "Backend:  http://localhost:4000"
echo "Database: localhost:5451"
echo ""
