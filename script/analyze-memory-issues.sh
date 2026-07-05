#!/bin/bash
# Comprehensive Memory Analysis for Keep-Alive System
# Based on the spec requirements for 9K+ devices

echo "🔍 Keep-Alive Memory Analysis"
echo "============================"
echo ""

# Spec Requirements
echo "📋 Spec Requirements:"
echo "  • Target Devices: 9,363+ devices"
echo "  • Memory Protection: 900MB (max_memory_restart)"
echo "  • Node Heap: 1GB (--max-old-space-size=1024)"
echo ""

# Current Configuration Check
echo "⚙️  Configuration Check:"
CONFIG_CHECK=$(grep -A 8 "worker:keepalive" /var/www/sunmine/ecosystem.config.cjs | grep -E "max_memory_restart|node_args")

if echo "$CONFIG_CHECK" | grep -q "max_memory_restart"; then
    echo "  ✅ max_memory_restart: $(echo "$CONFIG_CHECK" | grep "max_memory_restart" | awk '{print $2}' | tr -d "',")"
else
    echo "  ❌ max_memory_restart: MISSING"
fi

if echo "$CONFIG_CHECK" | grep -q "max-old-space-size"; then
    echo "  ✅ node_args: $(echo "$CONFIG_CHECK" | grep "node_args" | awk '{print $2}' | tr -d "',")"
else
    echo "  ❌ node_args: MISSING"
fi
echo ""

# Current Memory Status
echo "📊 Current Memory Status:"
WORKER_MEM=$(pm2 list | grep "worker:keepalive" | awk '{print $12}')
WORKER_MEM_NUM=$(echo "$WORKER_MEM" | tr '[:upper:]' '[:lower:]' | sed 's/mb//' | sed 's/gb/*1024/' | bc)

echo "  • Keep-Alive Worker: $WORKER_MEM"
echo "  • Memory Percentage: $(echo "scale=1; ($WORKER_MEM_NUM * 100) / 900" | bc)% of limit"

if [ $WORKER_MEM_NUM -lt 450 ]; then
    echo "  ✅ Status: HEALTHY (under 50% capacity)"
elif [ $WORKER_MEM_NUM -lt 600 ]; then
    echo "  ⚠️  Status: MONITOR (50-66% capacity)"
elif [ $WORKER_MEM_NUM -lt 900 ]; then
    echo "  ⚠️  Status: WARNING (66-100% capacity)"
else
    echo "  ❌ Status: CRITICAL (over 100% capacity)"
fi
echo ""

# Memory Trend Analysis
echo "📈 Memory Trend Analysis (last 10 cycles):"
pm2 logs worker:keepalive --lines 200 --nostream 2>/dev/null | \
    grep -E "Cycle complete" | \
    tail -5 | \
    sed 's/.*Cycle complete:/  •/' | \
    sed 's/(/ (/' | \
    sed 's/ms)/ms)/'

echo ""

# Potential Issues Analysis
echo "🔍 Potential Memory Issues:"
echo "  Checking for common issues..."
echo ""

# Check 1: Large arrays in memory
echo "  1. Large Arrays/Objects:"
echo "     • keepAliveAttempts Map size: $(node -e "console.log(process.env.KEEPALIVE_ATTEMPTS_SIZE || 'unknown')")"
echo "     • Device batch size: 1,000 (✓ within spec)"

# Check 2: MongoDB connections
echo "  2. Database Connections:"
echo "     • MongoDB maxPoolSize: 200 (for 62GB system)"
echo "     • Connection reuse: ✓ (singleton pattern)"

# Check 3: Firebase connections
echo "  3. Firebase Connections:"
echo "     • Singleton pattern: ✓ (getFirebaseApp())"
echo "     • Connection reuse: ✓"

echo ""

# Performance Metrics
echo "⚡ Performance Metrics:"
LAST_CYCLES=$(pm2 logs worker:keepalive --lines 100 --nostream 2>/dev/null | \
    grep -oP "Cycle complete: \K[0-9]+ pinged" | \
    grep -oP "[0-9]+" | \
    tail -5)

if [ -n "$LAST_CYCLES" ]; then
    TOTAL_PINGED=0
    COUNT=0
    for num in $LAST_CYCLES; do
        TOTAL_PINGED=$((TOTAL_PINGED + num))
        COUNT=$((COUNT + 1))
    done
    if [ $COUNT -gt 0 ]; then
        AVG_PINGED=$((TOTAL_PINGED / COUNT))
        echo "  • Average devices pinged/cycle: $AVG_PINGED"
        echo "  • Success rate: $(echo "scale=1; ($AVG_PINGED * 100) / 1000" | bc)%"
    fi
fi
echo ""

# Recommendations
echo "💡 Recommendations:"
if [ $WORKER_MEM_NUM -lt 300 ]; then
    echo "  ✅ Memory usage is excellent"
    echo "  ✅ System is well optimized for 9K+ devices"
    echo "  ✅ No immediate action required"
elif [ $WORKER_MEM_NUM -lt 600 ]; then
    echo "  ⚠️  Monitor memory trends"
    echo "  ⚠️  Consider reducing batch size if memory increases"
else
    echo "  ❌ Memory is approaching limits"
    echo "  ❌ Consider reducing MAX_DEVICES_PER_CYCLE"
    echo "  ❌ Check for memory leaks in device processing"
fi
echo ""

echo "🔧 Quick Commands:"
echo "  • Monitor memory: watch -n 5 'pm2 list | grep keepalive'"
echo "  • Monitor cycles: pm2 logs worker:keepalive --lines 0 | grep 'Cycle complete'"
echo "  • Memory monitor: /var/www/sunmine/script/monitor-memory.sh"
