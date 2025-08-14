"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeWindow = void 0;
const lru_cache_1 = require("lru-cache");
class TimeWindow {
    constructor(options) {
        this.options = options;
        this.eventCount = 0;
        const now = Date.now();
        this.windowStart = now;
        this.windowEnd = now + options.windowSize;
        // Initialize LRU cache with memory-based sizing
        // Use maxSize to limit by memory consumption instead of key count
        // Estimate ~1KB per event (conservative estimate for typical log event)
        const estimatedBytesPerEvent = 1024;
        const maxSizeBytes = options.maxEvents * estimatedBytesPerEvent;
        this.events = new lru_cache_1.LRUCache({
            // No fixed max key limit - let it grow as needed
            maxSize: maxSizeBytes,
            // Calculate size of each cache entry
            sizeCalculation: (value) => {
                // Rough estimate: 1KB per event, minimum 1 byte for empty arrays
                return Math.max(1, value.length * estimatedBytesPerEvent);
            },
            // TTL to expire old windows
            ttl: options.windowSize + options.lateTolerance,
            // Keep frequently accessed keys active
            updateAgeOnGet: true,
            // Allow stale entries to be returned while revalidating
            allowStale: false
        });
    }
    addEvent(event, key) {
        const eventTime = new Date(event.timestamp).getTime();
        // Check if event is within window (with late tolerance)
        if (eventTime < this.windowStart - this.options.lateTolerance) {
            return false; // Too old
        }
        if (eventTime > this.windowEnd) {
            return false; // Too new for this window
        }
        // Check memory limit
        if (this.eventCount >= this.options.maxEvents) {
            return false;
        }
        // Get or create event array for this key
        let keyEvents = this.events.get(key);
        if (!keyEvents) {
            keyEvents = [];
            // The LRU cache will automatically evict least recently used keys
            // if we exceed maxSize, ensuring memory bounds are respected
            this.events.set(key, keyEvents);
        }
        keyEvents.push(event);
        this.eventCount++;
        return true;
    }
    getEvents(key) {
        return this.events.get(key) || [];
    }
    getAllKeys() {
        return [...this.events.keys()];
    }
    isExpired(currentTime) {
        return currentTime > this.windowEnd + this.options.lateTolerance;
    }
    getTimeRange() {
        return {
            start: new Date(this.windowStart).toISOString(),
            end: new Date(this.windowEnd).toISOString()
        };
    }
    clear() {
        this.events.clear();
        this.eventCount = 0;
    }
    getEventCount() {
        return this.eventCount;
    }
    getMemoryUsage() {
        // Rough estimate of memory usage
        return this.eventCount * 1024; // Assume ~1KB per event
    }
}
exports.TimeWindow = TimeWindow;
//# sourceMappingURL=time-window.js.map