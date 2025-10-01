#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/home/ecolvin722/script_logs/javascript_scripts.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting JavaScript scripts execution"

cd "$SCRIPT_DIR" || exit 1

# Git: Pull latest changes first
log "Pulling latest changes from Git..."
if git pull origin main 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Git pull successful"
else
    log "❌ Git pull failed"
    # Continue execution even if pull fails
fi

# Install/update dependencies if package.json exists
if [ -f "package.json" ]; then
    log "Installing/updating npm dependencies"
    if npm install 2>&1 | tee -a "$LOG_FILE"; then
        log "✅ npm dependencies installed/updated"
    else
        log "❌ npm install failed"
        exit 1
    fi
fi

# Run the main Node.js script
if [ -f "manualRun.js" ]; then
    log "Running: manualRun.js"
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

# Git: Add, commit, and push changes
log "Committing and pushing changes to Git..."
if git add . 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Git add successful"
else
    log "❌ Git add failed"
    exit 1
fi

if git commit -m "Auto-commit: Update data $(date '+%Y-%m-%d %H:%M:%S')" 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Git commit successful"
else
    log "⚠️  Git commit - no changes to commit (this is normal if no data changed)"
    # Don't exit here - no changes is normal
fi

if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Git push successful"
else
    log "❌ Git push failed"
    exit 1
fi

log "JavaScript scripts execution finished"
