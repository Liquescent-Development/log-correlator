import { LogEvent } from "./types";
export interface DeduplicationOptions {
  windowSize: number;
  hashFields?: string[];
  maxCacheSize?: number;
}
export declare class EventDeduplicator {
  private options;
  private seenHashes;
  private cleanupInterval?;
  constructor(options: DeduplicationOptions);
  /**
   * Check if an event is a duplicate
   * @returns true if duplicate, false if new event
   */
  isDuplicate(event: LogEvent): boolean;
  /**
   * Filter out duplicate events from a stream
   */
  deduplicate<T extends LogEvent>(stream: AsyncIterable<T>): AsyncGenerator<T>;
  private computeHash;
  private cleanup;
  destroy(): void;
}
//# sourceMappingURL=event-deduplicator.d.ts.map
