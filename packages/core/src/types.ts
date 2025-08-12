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
    completeness: 'complete' | 'partial';
    matchedStreams: string[];
    totalStreams: number;
  };
}

export interface CorrelationEngineOptions {
  defaultTimeWindow?: string;
  timeWindow?: number;
  maxEvents?: number;
  lateTolerance?: string | number;
  joinType?: 'inner' | 'left' | 'outer';
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

export class CorrelationError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'CorrelationError';
    this.code = code;
    this.details = details;
  }
}

export type JoinType = 'and' | 'or' | 'unless';

export interface ParsedQuery {
  leftStream: StreamQuery;
  rightStream: StreamQuery;
  joinType: JoinType;
  joinKeys: string[];
  timeWindow?: string;
  temporal?: string;
  grouping?: {
    side: 'left' | 'right';
    labels: string[];
  };
  ignoring?: string[];
  labelMappings?: Array<{ left: string; right: string }>;
  filter?: string;
}

export interface StreamQuery {
  source: string;
  selector: string;
  timeRange: string;
  alias?: string;
}