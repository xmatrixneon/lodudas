#!/bin/bash
# Memory Monitor for Keep-Alive Worker
# Tracks memory usage and detects potential issues

echo "🔍 Keep-Alive Memory Monitor"
echo "Press Ctrl+C to stop"
echo ""

# Memory thresholds from spec
MAX_MEMORY_MB=900
WARN_MEMORY_MB=600

while true; do
    clear
    echo "🔍 Keep-Alive Memory Monitor"
    echo "================================"
    echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Get worker status
    WORKER_INFO=$(pm2 list | grep "worker:keepalive" | awk '{print $2, $4, $6, $10, $12}')

    if [ -z "$WORKER_INFO" ]; then
        echo "❌ Worker not found!"
        sleep 5
        continue
    fi

    # Parse memory usage (e.g., "143.6mb" -> 143.6)
    MEMORY_RAW=$(echo "$WORKER_INFO" | awk '{print $4}' | tr '[:upper:]' '[:lower:]')
    MEMORY_MB=$(echo "$MEMORY_RAW" | sed 's/mb//' | sed 's/gb/*1024/' | bc 2>/dev/null || echo "0")

    echo "📊 Current Memory Usage:"
    echo "  • Memory: ${MEMORY_RAW}"
    echo "  • Warning Threshold: ${WARN_MEMORY_MB}MB"
    echo "  • Max Threshold: ${MAX_MEMORY_MB}MB"
    echo "  • Auto-restart: Enabled (at ${MAX_MEMORY_MB}MB)"
    echo ""

    # Memory usage percentage
    PERCENT=$(echo "scale=1; ($MEMORY_MB * 100) / $MAX_MEMORY_MB" | bc 2>/dev/null || echo "0")

    # Create memory bar
    BAR_LENGTH=40
    FILLED=$(echo "scale=0; ($PERCENT * $BAR_LENGTH) / 100" | bc 2>/dev/null || echo "0")

    printf "┌"
    for ((i=0; i<FILLED; i++)); do
        if [ $MEMORY_MB -gt $WARN_MEMORY_MB ]; then
            printf "█"  # Red/danger zone
        else
            printf "▓"  # Normal zone
        fi
    done
    for ((i=FILLED; i<BAR_LENGTH; i++)); do printf "░"; done
    printf "┐ ${PERCENT}%%\n"

    echo ""
    echo "📋 Memory Status:"

    if [ $MEMORY_MB -gt $MAX_MEMORY_MB ]; then
        echo "  ❌ CRITICAL: Above maximum! Worker should restart."
    elif [ $MEMORY_MB -gt $WARN_MEMORY_MB ]; then
        echo "  ⚠️  WARNING: Approaching memory limit"
    else
        echo "  ✅ Healthy: Memory usage is normal"
    fi

    echo ""
    echo "📈 Memory Trend (last 5 checks):"
    MEMORY_LOG=$(pm2 logs worker:keepalive --lines 200 --nostream 2>/dev/null | \
        grep -oP '\d+(?:\.\d+)?[mM][bB]' | \
        tail -5 | \
        tr '\n' ' ' | \
        sed 's/mb/MB/g' | \
        sed 's/mb/MB/g')

    if [ -n "$MEMORY_LOG" ]; then
        echo "  Recent: $MEMORY_LOG"
    else
        echo "  No recent memory data available"
    fi

    echo ""
    echo "🔧 System Info:"
    echo "  • Node heap limit: 1GB (--max-old-space-size=1024)"
    echo "  • PM2 restart threshold: ${MAX_MEMORY_MB}MB"
    echo "  • Current devices: ~9,363"
    echo "  • Batch size: 1,000 devices/cycle"

    echo ""
    echo "Next update in 10 seconds... (Ctrl+C to exit)"

    sleep 10
done
