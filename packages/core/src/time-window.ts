import { LogEvent } from './types';

export interface TimeWindowOptions {
  windowSize: number;
  lateTolerance: number;
  maxEvents: number;
}

export class TimeWindow {
  private events: Map<string, LogEvent[]> = new Map();
  private windowStart: number;
  private windowEnd: number;
  private eventCount = 0;

  constructor(private options: TimeWindowOptions) {
    const now = Date.now();
    this.windowStart = now;
    this.windowEnd = now + options.windowSize;
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

    // Add event to window
    if (!this.events.has(key)) {
      this.events.set(key, []);
    }
    
    this.events.get(key)!.push(event);
    this.eventCount++;
    
    return true;
  }

  getEvents(key: string): LogEvent[] {
    return this.events.get(key) || [];
  }

  getAllKeys(): string[] {
    return Array.from(this.events.keys());
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