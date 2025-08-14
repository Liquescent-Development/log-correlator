import { EventEmitter } from "eventemitter3";
import {
  CorrelationEngineOptions,
  DataSourceAdapter,
  CorrelatedEvent,
} from "./types";
/**
 * Main correlation engine for real-time log stream processing
 * @extends EventEmitter
 * @fires CorrelationEngine#correlationFound - When a new correlation is discovered
 * @fires CorrelationEngine#performanceMetrics - Performance metrics update
 * @fires CorrelationEngine#memoryWarning - When memory usage exceeds threshold
 * @fires CorrelationEngine#adapterAdded - When a new adapter is registered
 * @example
 * ```javascript
 * const engine = new CorrelationEngine({
 *   timeWindow: 30000,
 *   maxEvents: 10000
 * });
 * ```
 */
export declare class CorrelationEngine extends EventEmitter {
  private adapters;
  private options;
  private activeJoiners;
  private performanceMonitor;
  private backpressureController?;
  private queryParser;
  private gcInterval?;
  constructor(options?: CorrelationEngineOptions);
  addAdapter(name: string, adapter: DataSourceAdapter): void;
  getAdapter(name: string): DataSourceAdapter | undefined;
  correlate(query: string): AsyncGenerator<CorrelatedEvent>;
  validateQuery(query: string): boolean;
  private parseQuery;
  private validateParsedQuery;
  private instrumentStream;
  private getAdapterForSource;
  private startGarbageCollection;
  destroy(): Promise<void>;
}
//# sourceMappingURL=correlation-engine.d.ts.map
