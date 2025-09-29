#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/home/ecolvin722/script_logs/javascript_scripts.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting JavaScript scripts execution"

cd "$SCRIPT_DIR" || exit 1

# Install/update dependencies if package.json exists
if [ -f "package.json" ]; then
    log "Installing/updating npm dependencies"
    npm install 2>&1 | tee -a "$LOG_FILE"
fi

# Run the main Node.js script
if [ -f "manualRun.js" ]; then
    log "Running: your-main-script.js"
    if node "manualRun.js" 2>&1 | tee -a "$LOG_FILE"; then
        log "✅ JavaScript script completed successfully"
    else
        log "❌ JavaScript script failed with exit code: $?"
        exit 1
    fi
else
    log "ERROR: Main JavaScript script not found"
    exit 1
fi

log "JavaScript scripts execution finished"
