import { EventEmitter } from 'eventemitter3';
import {
  CorrelationEngineOptions,
  DataSourceAdapter,
  CorrelatedEvent,
  CorrelationError,
  ParsedQuery
} from './types';
import { StreamJoiner } from './stream-joiner';
import { MultiStreamJoiner } from './multi-stream-joiner';
import { BackpressureController } from './backpressure-controller';
import { PerformanceMonitor } from './performance-monitor';
import { parseTimeWindow } from './utils';

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
export class CorrelationEngine extends EventEmitter {
  private adapters: Map<string, DataSourceAdapter> = new Map();
  private options: Required<CorrelationEngineOptions>;
  private activeJoiners: Set<StreamJoiner | MultiStreamJoiner> = new Set();
  private performanceMonitor: PerformanceMonitor;
  private backpressureController?: BackpressureController;

  constructor(options: CorrelationEngineOptions = {}) {
    super();
    
    this.options = {
      defaultTimeWindow: options.defaultTimeWindow || '5m',
      timeWindow: options.timeWindow || parseTimeWindow(options.defaultTimeWindow || '5m'),
      maxEvents: options.maxEvents || 10000,
      lateTolerance: typeof options.lateTolerance === 'string' 
        ? parseTimeWindow(options.lateTolerance)
        : options.lateTolerance || 30000,
      joinType: options.joinType || 'inner',
      bufferSize: options.bufferSize || 1000,
      processingInterval: typeof options.processingInterval === 'string'
        ? parseTimeWindow(options.processingInterval)
        : options.processingInterval || 100,
      maxMemoryMB: options.maxMemoryMB || 100,
      gcInterval: typeof options.gcInterval === 'string'
        ? parseTimeWindow(options.gcInterval)
        : options.gcInterval || 30000
    };

    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor(5000);
    this.performanceMonitor.start();
    
    // Set up performance monitoring events
    this.performanceMonitor.on('metrics', (metrics) => {
      this.emit('performanceMetrics', metrics);
    });
    
    this.performanceMonitor.on('highMemoryUsage', (info) => {
      this.emit('memoryWarning', info);
    });

    // Initialize backpressure controller if needed
    if (options.bufferSize) {
      this.backpressureController = new BackpressureController({
        highWaterMark: options.bufferSize,
        lowWaterMark: Math.floor(options.bufferSize * 0.5),
        maxBufferSize: options.bufferSize * 2
      });
    }

    // Start garbage collection
    this.startGarbageCollection();
  }

  addAdapter(name: string, adapter: DataSourceAdapter): void {
    if (this.adapters.has(name)) {
      throw new CorrelationError(
        `Adapter ${name} already registered`,
        'ADAPTER_EXISTS'
      );
    }
    this.adapters.set(name, adapter);
    this.emit('adapterAdded', name);
  }

  getAdapter(name: string): DataSourceAdapter | undefined {
    return this.adapters.get(name);
  }

  async *correlate(query: string): AsyncGenerator<CorrelatedEvent> {
    // Parse the query (simplified for now - would use full parser in production)
    const parsedQuery = this.parseQuery(query);
    
    // Validate adapters exist
    const leftAdapter = this.getAdapterForSource(parsedQuery.leftStream.source);
    const rightAdapter = this.getAdapterForSource(parsedQuery.rightStream.source);

    if (!leftAdapter || !rightAdapter) {
      throw new CorrelationError(
        'Required data source adapter not found',
        'ADAPTER_NOT_FOUND',
        { 
          leftSource: parsedQuery.leftStream.source,
          rightSource: parsedQuery.rightStream.source
        }
      );
    }

    // Create streams from adapters
    const leftStream = leftAdapter.createStream(
      parsedQuery.leftStream.selector,
      { timeRange: parsedQuery.leftStream.timeRange }
    );
    
    const rightStream = rightAdapter.createStream(
      parsedQuery.rightStream.selector,
      { timeRange: parsedQuery.rightStream.timeRange }
    );

    // Create joiner
    const joiner = new StreamJoiner({
      joinType: parsedQuery.joinType,
      joinKeys: parsedQuery.joinKeys,
      timeWindow: parseTimeWindow(parsedQuery.timeWindow || this.options.defaultTimeWindow),
      lateTolerance: this.options.lateTolerance as number,
      maxEvents: this.options.maxEvents,
      temporal: parsedQuery.temporal ? parseTimeWindow(parsedQuery.temporal) : undefined,
      labelMappings: parsedQuery.labelMappings
    });

    this.activeJoiners.add(joiner);

    try {
      // Perform join and yield results
      for await (const correlation of joiner.join(leftStream, rightStream)) {
        this.emit('correlationFound', correlation);
        yield correlation;
      }
    } finally {
      this.activeJoiners.delete(joiner);
      joiner.cleanup();
    }
  }

  validateQuery(query: string): boolean {
    try {
      this.parseQuery(query);
      return true;
    } catch {
      return false;
    }
  }

  private parseQuery(query: string): ParsedQuery {
    // Simplified query parsing - in production would use proper parser
    // Example: loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m]
    
    const joinMatch = query.match(/\b(and|or|unless)\s+on\s*\(([^)]+)\)/i);
    if (!joinMatch) {
      throw new CorrelationError('Invalid query syntax', 'QUERY_PARSE_ERROR');
    }

    const joinType = joinMatch[1].toLowerCase() as 'and' | 'or' | 'unless';
    const joinKeysRaw = joinMatch[2].split(',').map(k => k.trim());
    
    // Parse join keys and check for label mappings
    const joinKeys: string[] = [];
    const labelMappings: Array<{ left: string; right: string }> = [];
    
    for (const key of joinKeysRaw) {
      if (key.includes('=')) {
        // This is a label mapping
        const [left, right] = key.split('=').map(k => k.trim());
        labelMappings.push({ left, right });
        // Also add both keys to joinKeys for compatibility
        joinKeys.push(left, right);
      } else {
        // Regular join key
        joinKeys.push(key);
      }
    }

    // Check for temporal constraint
    const temporalMatch = query.match(/within\s*\(([^)]+)\)/i);
    const temporal = temporalMatch ? temporalMatch[1] : undefined;

    // Extract stream queries (simplified)
    const streamPattern = /(\w+)\s*\(([^)]+)\)\s*\[([^\]]+)\]/g;
    const streams: StreamQuery[] = [];
    let match;

    while ((match = streamPattern.exec(query)) !== null) {
      streams.push({
        source: match[1],
        selector: match[2],
        timeRange: match[3]
      });
    }

    if (streams.length < 2) {
      throw new CorrelationError(
        'Query must include at least two streams',
        'QUERY_PARSE_ERROR'
      );
    }

    return {
      leftStream: streams[0],
      rightStream: streams[1],
      joinType,
      joinKeys,
      timeWindow: streams[0].timeRange,
      temporal,
      labelMappings: labelMappings.length > 0 ? labelMappings : undefined
    };
  }

  private getAdapterForSource(source: string): DataSourceAdapter | undefined {
    // Direct match
    if (this.adapters.has(source)) {
      return this.adapters.get(source);
    }

    // Try to find adapter by name
    for (const [name, adapter] of this.adapters) {
      if (name.toLowerCase() === source.toLowerCase()) {
        return adapter;
      }
    }

    return undefined;
  }

  private startGarbageCollection(): void {
    setInterval(() => {
      // Clean up inactive joiners (they handle their own cleanup)

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
      
      if (memoryMB > this.options.maxMemoryMB) {
        this.emit('memoryWarning', { usedMB: memoryMB, maxMB: this.options.maxMemoryMB });
      }
    }, this.options.gcInterval as number);
  }

  async destroy(): Promise<void> {
    // Clean up all joiners
    for (const joiner of this.activeJoiners) {
      joiner.cleanup();
    }
    this.activeJoiners.clear();

    // Destroy all adapters
    for (const adapter of this.adapters.values()) {
      await adapter.destroy();
    }
    this.adapters.clear();

    this.removeAllListeners();
  }
}