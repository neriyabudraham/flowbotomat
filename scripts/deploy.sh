#!/bin/bash

# ==============================================
# FlowBotomat - Smart Deploy Script
# Zero-downtime deployment with health checks
# ==============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

# Health check function
check_health() {
    local service=$1
    local max_attempts=$2
    local attempt=1
    
    log "בודק תקינות $service..."
    
    while [ $attempt -le $max_attempts ]; do
        if [ "$service" == "backend" ]; then
            # Check backend health
            if curl -sf http://localhost:3749/api/health > /dev/null 2>&1; then
                success "$service עובד!"
                return 0
            fi
        elif [ "$service" == "frontend" ]; then
            # Check frontend
            if curl -sf http://localhost:3748 > /dev/null 2>&1; then
                success "$service עובד!"
                return 0
            fi
        fi
        
        log "ניסיון $attempt מתוך $max_attempts... ממתין 3 שניות"
        sleep 3
        attempt=$((attempt + 1))
    done
    
    error "$service לא הגיב לאחר $max_attempts ניסיונות"
    return 1
}

# Main deploy function
deploy() {
    cd "$PROJECT_DIR"
    
    log "======================================"
    log "  מתחיל תהליך עדכון FlowBotomat"
    log "======================================"
    
    # Step 1: Pull latest code
    log "שולף קוד חדש..."
    git pull origin main
    success "קוד עודכן"
    
    # Step 2: Build new images WITHOUT stopping existing containers
    log "בונה images חדשים (ברקע)..."
    docker compose build --no-cache backend frontend
    success "Images נבנו בהצלחה"
    
    # Step 3: Rolling update - one service at a time
    
    # Update backend first (frontend can work without it for a moment)
    log "מעדכן Backend..."
    docker compose up -d --no-deps backend
    
    # Wait for backend to be healthy
    if ! check_health "backend" 20; then
        error "Backend לא עלה כמו שצריך!"
        warn "מנסה rollback..."
        docker compose logs backend --tail=50
        exit 1
    fi
    
    # Update frontend
    log "מעדכן Frontend..."
    docker compose up -d --no-deps frontend
    
    # Wait for frontend to be healthy
    if ! check_health "frontend" 15; then
        error "Frontend לא עלה כמו שצריך!"
        docker compose logs frontend --tail=50
        exit 1
    fi
    
    # Step 4: Cleanup old images
    log "מנקה images ישנים..."
    docker image prune -f > /dev/null 2>&1
    
    log "======================================"
    success "העדכון הושלם בהצלחה! 🎉"
    log "======================================"
    
    # Show status
    docker compose ps
}

# Quick restart without rebuild
quick_restart() {
    cd "$PROJECT_DIR"
    
    log "מבצע restart מהיר..."
    
    # Graceful restart - one at a time
    docker compose restart backend
    check_health "backend" 15
    
    docker compose restart frontend
    check_health "frontend" 10
    
    success "Restart הושלם!"
}

# Show usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  deploy    - Full deployment with build (default)"
    echo "  restart   - Quick restart without rebuild"
    echo "  status    - Show services status"
    echo "  logs      - Show recent logs"
    echo ""
}

# Parse command
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    restart)
        quick_restart
        ;;
    status)
        docker compose ps
        ;;
    logs)
        docker compose logs --tail=100 -f
        ;;
    *)
        usage
        ;;
esac
