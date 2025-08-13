import { LogEvent } from './types';
import { LRUCache } from 'lru-cache';

export interface TimeWindowOptions {
  windowSize: number;
  lateTolerance: number;
  maxEvents: number;
}

export class TimeWindow {
  private events: LRUCache<string, LogEvent[]>;
  private windowStart: number;
  private windowEnd: number;
  private eventCount = 0;

  constructor(private options: TimeWindowOptions) {
    const now = Date.now();
    this.windowStart = now;
    this.windowEnd = now + options.windowSize;
    
    // Initialize LRU cache with memory-based sizing
    // Use maxSize to limit by memory consumption instead of key count
    // Estimate ~1KB per event (conservative estimate for typical log event)
    const estimatedBytesPerEvent = 1024;
    const maxSizeBytes = options.maxEvents * estimatedBytesPerEvent;
    
    this.events = new LRUCache<string, LogEvent[]>({
      // No fixed max key limit - let it grow as needed
      maxSize: maxSizeBytes,
      // Calculate size of each cache entry
      sizeCalculation: (value: LogEvent[]) => {
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

  addEvent(event: LogEvent, key: string): boolean {
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

  getEvents(key: string): LogEvent[] {
    return this.events.get(key) || [];
  }

  getAllKeys(): string[] {
    return [...this.events.keys()];
  }

  isExpired(currentTime: number): boolean {
    return currentTime > this.windowEnd + this.options.lateTolerance;
  }

  getTimeRange(): { start: string; end: string } {
    return {
      start: new Date(this.windowStart).toISOString(),
      end: new Date(this.windowEnd).toISOString()
    };
  }

  clear(): void {
    this.events.clear();
    this.eventCount = 0;
  }

  getEventCount(): number {
    return this.eventCount;
  }

  getMemoryUsage(): number {
    // Rough estimate of memory usage
    return this.eventCount * 1024; // Assume ~1KB per event
  }
}