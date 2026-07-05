#!/bin/bash
# Quick Memory Health Check for Keep-Alive System

clear
echo "🔍 Keep-Alive Memory Health Check"
echo "================================"
echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Get current memory
MEM_INFO=$(pm2 list | grep "worker:keepalive")
CURRENT_MEM=$(echo "$MEM_INFO" | awk '{print $12}')

# Extract numeric value
MEM_NUM=$(echo "$CURRENT_MEM" | tr '[:upper:]' '[:lower:]' | sed 's/mb//' | sed 's/gb/*1024/' | bc 2>/dev/null || echo "150")

# Calculate percentage
PERCENT=$(echo "scale=1; ($MEM_NUM * 100) / 900" | bc 2>/dev/null || echo "16.7")

echo "📊 Current Memory: $CURRENT_MEM (${PERCENT}% of limit)"
echo ""

# Status determination
if [ $MEM_NUM -lt 450 ]; then
    STATUS="✅ HEALTHY"
    COLOR="🟢"
elif [ $MEM_NUM -lt 600 ]; then
    STATUS="⚠️  MONITOR"
    COLOR="🟡"
elif [ $MEM_NUM -lt 900 ]; then
    STATUS="⚠️  WARNING"
    COLOR="🟠"
else
    STATUS="❌ CRITICAL"
    COLOR="🔴"
fi

echo "$COLOR Status: $STATUS"
echo ""

# Memory bar
BAR_LENGTH=30
FILLED=$(echo "scale=0; ($PERCENT * $BAR_LENGTH) / 100" | bc 2>/dev/null || echo "5")

echo "Memory Bar:"
printf "  ["
for ((i=0; i<FILLED; i++)); do printf "█"; done
for ((i=FILLED; i<BAR_LENGTH; i++)); do printf "░"; done
printf "] ${PERCENT}%%\n"
echo ""

# Quick stats
echo "📋 Quick Stats:"
echo "  • Memory Limit: 900MB (auto-restart)"
echo "  • Node Heap: 1GB"
echo "  • Target Devices: 9,363+"
echo "  • Batch Size: 1,000"
echo ""

# Recent cycle performance
echo "🔄 Recent Cycles:"
pm2 logs worker:keepalive --lines 100 --nostream 2>/dev/null | \
    grep "Cycle complete" | \
    tail -3 | \
    sed 's/.*Keepalive] /  • /' | \
    sed 's/ (//' | sed 's/ms)/ms/'

echo ""
echo "💡 Quick Actions:"
echo "  • Detailed analysis: bash /var/www/sunmine/script/analyze-memory-issues.sh"
echo "  • Live monitor: bash /var/www/sunmine/script/monitor-memory.sh"
echo "  • Cycle monitor: bash /var/www/sunmine/script/monitor-keepalive.sh"
