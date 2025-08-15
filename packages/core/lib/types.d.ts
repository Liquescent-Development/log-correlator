export interface LogEvent {
  timestamp: string;
  source: string;
  stream?: string;
  message: string;
  labels: Record<string, string>;
  joinKeys?: Record<string, string>;
}
export interface CorrelatedEvent {
  correlationId: string;
  timestamp: string;
  timeWindow: {
    start: string;
    end: string;
  };
  joinKey: string;
  joinValue: string;
  events: Array<{
    alias?: string;
    source: string;
    timestamp: string;
    message: string;
    labels: Record<string, string>;
  }>;
  metadata: {
    completeness: "complete" | "partial";
    matchedStreams: string[];
    totalStreams: number;
  };
}
export interface CorrelationEngineOptions {
  defaultTimeWindow?: string;
  timeWindow?: number;
  maxEvents?: number;
  lateTolerance?: string | number;
  joinType?: "inner" | "left" | "outer";
  bufferSize?: number;
  processingInterval?: string | number;
  maxMemoryMB?: number;
  gcInterval?: string | number;
}
export interface StreamOptions {
  timeRange?: string;
  limit?: number;
  [key: string]: unknown;
}
export interface DataSourceAdapter {
  createStream(query: string, options?: StreamOptions): AsyncIterable<LogEvent>;
  validateQuery(query: string): boolean;
  getName(): string;
  getAvailableStreams?(): Promise<string[]>;
  destroy(): Promise<void>;
}
export declare class CorrelationError extends Error {
  code: string;
  details?: unknown;
  constructor(message: string, code: string, details?: unknown);
}
//# sourceMappingURL=types.d.ts.map
