import {
  DataSourceAdapter,
  LogEvent,
  StreamOptions,
} from "@liquescent/log-correlator-core";
export interface PromQLAdapterOptions {
  url: string;
  username?: string;
  password?: string;
  apiToken?: string;
  pollInterval?: number;
  timeout?: number;
  maxRetries?: number;
}
export declare class PromQLAdapter implements DataSourceAdapter {
  private options;
  private authHeader;
  private abortController?;
  constructor(options: PromQLAdapterOptions);
  createStream(query: string, options?: StreamOptions): AsyncIterable<LogEvent>;
  private createPollingStream;
  private queryMetrics;
  private fetchMetrics;
  private queryPrometheus;
  private transformMetricsToEvents;
  private getMetricName;
  private parseTimeRange;
  private sleep;
  validateQuery(query: string): boolean;
  getName(): string;
  getAvailableStreams(): Promise<string[]>;
  destroy(): Promise<void>;
}
//# sourceMappingURL=promql-adapter.d.ts.map
