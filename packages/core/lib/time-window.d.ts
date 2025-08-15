import { LogEvent } from "./types";
export interface TimeWindowOptions {
  windowSize: number;
  lateTolerance: number;
  maxEvents: number;
}
export declare class TimeWindow {
  private options;
  private events;
  private windowStart;
  private windowEnd;
  private eventCount;
  constructor(options: TimeWindowOptions);
  addEvent(event: LogEvent, key: string): boolean;
  getEvents(key: string): LogEvent[];
  getAllKeys(): string[];
  isExpired(currentTime: number): boolean;
  getTimeRange(): {
    start: string;
    end: string;
  };
  clear(): void;
  getEventCount(): number;
  getMemoryUsage(): number;
}
//# sourceMappingURL=time-window.d.ts.map
