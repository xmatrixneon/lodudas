#!/bin/bash
# Keep-Alive Cycle Monitor
# Shows real-time progression through all devices

echo "🔄 Keep-Alive Cycle Monitor"
echo "Press Ctrl+C to stop monitoring"
echo ""

while true; do
    clear
    echo "🔄 Keep-Alive Cycle Monitor"
    echo "========================================"
    echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Get current position
    OFFSET=$(redis-cli get keepalive:device:offset 2>/dev/null || echo "0")

    # Calculate progress
    if [ "$OFFSET" -eq 0 ]; then
        PROGRESS=0
    else
        PROGRESS=$(( (OFFSET * 100) / 9363 ))
    fi

    echo "📍 Current Position: Device $OFFSET"
    echo "📊 Total Devices: 9,363"
    echo "🔄 Cycle Progress: ${PROGRESS}%"
    echo ""

    # Create progress bar
    BAR_LENGTH=50
    FILLED=$(( (PROGRESS * BAR_LENGTH) / 100 ))
    EMPTY=$(( BAR_LENGTH - FILLED ))

    printf "┌"
    for ((i=0; i<FILLED; i++)); do printf "█"; done
    for ((i=0; i<EMPTY; i++)); do printf "░"; done
    printf "┐ ${PROGRESS}%%\n"

    echo ""
    echo "Recent Cycles:"
    echo "───────────────────────────────────────"
    pm2 logs worker:keepalive --lines 100 --nostream 2>/dev/null | \
        grep -E "(Cycle complete|Next cycle)" | \
        tail -5 | \
        sed 's/16|worker: |/  /' | \
        sed 's/\[Keepalive\] //'

    echo ""
    echo "📋 Quick Stats:"
    echo "  • Cycle Size: 1,000 devices"
    echo "  • Cycle Time: ~30 seconds"
    echo "  • Full Coverage: ~5 minutes"
    echo "  • Auto-Restart: ✅ Enabled"
    echo ""
    echo "Next update in 10 seconds... (Ctrl+C to exit)"

    sleep 10
done
