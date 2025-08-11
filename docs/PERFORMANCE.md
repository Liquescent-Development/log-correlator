# Performance Tuning Guide

## Table of Contents
- [Performance Overview](#performance-overview)
- [Benchmarking](#benchmarking)
- [Memory Optimization](#memory-optimization)
- [CPU Optimization](#cpu-optimization)
- [Network Optimization](#network-optimization)
- [Query Optimization](#query-optimization)
- [Scaling Strategies](#scaling-strategies)
- [Performance Monitoring](#performance-monitoring)

## Performance Overview

### Target Performance Metrics

| Metric | Target | Typical | Maximum |
|--------|--------|---------|---------|
| **Latency** | <100ms | 50-80ms | 200ms |
| **Throughput** | 1000 events/sec | 800-1200/sec | 5000/sec |
| **Memory Usage** | <100MB | 50-80MB | 500MB |
| **CPU Usage** | <50% single core | 30-40% | 100% |
| **Correlation Rate** | 100 correlations/sec | 80-120/sec | 500/sec |

### Quick Performance Wins

```javascript
// Before optimization: ~200ms latency, 500 events/sec
const engine = new CorrelationEngine();

// After optimization: ~50ms latency, 2000 events/sec
const engine = new CorrelationEngine({
  // Memory optimizations
  maxEvents: 5000,              // Reduce from 10000
  bufferSize: 500,              // Smaller buffers
  
  // Processing optimizations
  processingInterval: 50,       // More frequent processing
  
  // Cleanup optimizations
  gcInterval: 60000,            // Less frequent GC
  cleanupInterval: 30000        // Regular cleanup
});

// Enable performance features
const { EventDeduplicator, IndexedEventStore, ParallelProcessor } = require('@liquescent/log-correlator-core');

const dedup = new EventDeduplicator();
const store = new IndexedEventStore();
const processor = new ParallelProcessor({ maxWorkers: 4 });
```

## Benchmarking

### Basic Benchmark Script

```javascript
const { CorrelationEngine } = require('@liquescent/log-correlator-core');
const { performance } = require('perf_hooks');

async function benchmark(config = {}) {
  const engine = new CorrelationEngine(config);
  
  // Generate test data
  const events = generateTestEvents(10000);
  
  // Measure correlation time
  const start = performance.now();
  let correlationCount = 0;
  
  for await (const correlation of engine.correlate(testQuery)) {
    correlationCount++;
    if (correlationCount >= 1000) break;
  }
  
  const end = performance.now();
  const duration = end - start;
  
  return {
    duration: duration,
    correlations: correlationCount,
    throughput: (correlationCount / duration) * 1000,
    avgLatency: duration / correlationCount
  };
}

// Compare configurations
async function compareConfigs() {
  const configs = [
    { name: 'Default', config: {} },
    { name: 'Optimized', config: { maxEvents: 5000, bufferSize: 500 } },
    { name: 'Minimal', config: { maxEvents: 1000, bufferSize: 100 } }
  ];
  
  for (const { name, config } of configs) {
    const result = await benchmark(config);
    console.log(`${name}: ${result.throughput.toFixed(0)} events/sec, ${result.avgLatency.toFixed(2)}ms latency`);
  }
}
```

### Load Testing

```javascript
const { loadTest } = require('./tools/load-test');

async function performLoadTest() {
  const results = await loadTest({
    duration: 60000,        // 1 minute test
    eventsPerSecond: 1000,  // Target rate
    correlationQuery: testQuery,
    adapters: ['loki', 'graylog'],
    parallel: true
  });
  
  console.log('Load Test Results:');
  console.log(`  Success Rate: ${results.successRate}%`);
  console.log(`  P50 Latency: ${results.p50}ms`);
  console.log(`  P95 Latency: ${results.p95}ms`);
  console.log(`  P99 Latency: ${results.p99}ms`);
  console.log(`  Max Memory: ${results.maxMemoryMB}MB`);
}
```

## Memory Optimization

### Memory-Efficient Configuration

```javascript
// For limited memory environments (<100MB)
const lowMemoryConfig = {
  maxEvents: 1000,           // Keep minimal events
  bufferSize: 100,           // Small buffers
  defaultTimeWindow: '1m',   // Short windows
  gcInterval: 30000,         // Frequent GC
  maxMemoryMB: 50            // Hard limit
};

// For standard environments (100-500MB)
const standardConfig = {
  maxEvents: 5000,
  bufferSize: 500,
  defaultTimeWindow: '5m',
  gcInterval: 60000,
  maxMemoryMB: 200
};

// For high-memory environments (>500MB)
const highMemoryConfig = {
  maxEvents: 20000,
  bufferSize: 2000,
  defaultTimeWindow: '10m',
  gcInterval: 120000,
  maxMemoryMB: 1000
};
```

### Memory Profiling

```javascript
const v8 = require('v8');
const { writeHeapSnapshot } = v8;

// Take heap snapshots
function profileMemory(engine) {
  const snapshots = [];
  
  // Initial snapshot
  writeHeapSnapshot('heap-initial.heapsnapshot');
  
  // During correlation
  let eventCount = 0;
  engine.on('correlationFound', () => {
    eventCount++;
    if (eventCount % 1000 === 0) {
      const usage = process.memoryUsage();
      snapshots.push({
        events: eventCount,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers
      });
      
      // Take snapshot at milestones
      if (eventCount === 10000) {
        writeHeapSnapshot('heap-10k.heapsnapshot');
      }
    }
  });
  
  return snapshots;
}

// Analyze memory growth
function analyzeMemoryGrowth(snapshots) {
  const growth = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    growth.push({
      events: curr.events - prev.events,
      memoryIncrease: curr.heapUsed - prev.heapUsed,
      bytesPerEvent: (curr.heapUsed - prev.heapUsed) / (curr.events - prev.events)
    });
  }
  return growth;
}
```

### Preventing Memory Leaks

```javascript
// 1. Use weak references for caches
const WeakMap = require('weak-map');
const eventCache = new WeakMap();

// 2. Clear references after use
class CorrelationProcessor {
  constructor() {
    this.events = [];
  }
  
  async process() {
    try {
      // Process events
      await this.correlate();
    } finally {
      // Always clear references
      this.events = [];
      this.clearBuffers();
    }
  }
  
  clearBuffers() {
    this.buffer = null;
    this.cache = null;
    if (global.gc) global.gc();
  }
}

// 3. Use streaming to avoid accumulation
async function* streamWithCleanup(source) {
  const buffer = [];
  try {
    for await (const item of source) {
      buffer.push(item);
      if (buffer.length >= 100) {
        yield* buffer;
        buffer.length = 0; // Clear buffer
      }
    }
    if (buffer.length > 0) {
      yield* buffer;
    }
  } finally {
    buffer.length = 0; // Ensure cleanup
  }
}
```

## CPU Optimization

### Multi-Core Processing

```javascript
const { ParallelProcessor } = require('@liquescent/log-correlator-core');
const os = require('os');

// Optimize for available cores
const processor = new ParallelProcessor({
  maxWorkers: Math.max(1, os.cpus().length - 1), // Leave one core free
  taskQueueSize: 1000,
  workerIdleTimeout: 30000
});

// Distribute correlation across workers
async function parallelCorrelation(streams) {
  const workers = [];
  const chunkSize = Math.ceil(streams.length / processor.maxWorkers);
  
  for (let i = 0; i < streams.length; i += chunkSize) {
    const chunk = streams.slice(i, i + chunkSize);
    workers.push(processor.processChunk(chunk));
  }
  
  const results = await Promise.all(workers);
  return mergeResults(results);
}
```

### CPU Profiling

```javascript
const { performance, PerformanceObserver } = require('perf_hooks');

// Profile function execution
function profileFunction(fn, name) {
  return async function(...args) {
    performance.mark(`${name}-start`);
    try {
      const result = await fn.apply(this, args);
      return result;
    } finally {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
    }
  };
}

// Monitor performance
const obs = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    if (entry.duration > 100) {
      console.warn(`Slow operation: ${entry.name} took ${entry.duration}ms`);
    }
  });
});
obs.observe({ entryTypes: ['measure'] });

// Apply profiling
engine.correlate = profileFunction(engine.correlate, 'correlate');
```

### Algorithm Optimization

```javascript
// 1. Use indexed lookups instead of linear search
class OptimizedJoinIndex {
  constructor() {
    this.index = new Map();
  }
  
  // O(1) insertion
  add(key, value, event) {
    if (!this.index.has(key)) {
      this.index.set(key, new Map());
    }
    const keyIndex = this.index.get(key);
    if (!keyIndex.has(value)) {
      keyIndex.set(value, []);
    }
    keyIndex.get(value).push(event);
  }
  
  // O(1) lookup
  find(key, value) {
    return this.index.get(key)?.get(value) || [];
  }
}

// 2. Use binary search for time ranges
function binarySearchTimeRange(events, startTime, endTime) {
  let left = 0;
  let right = events.length - 1;
  let startIndex = events.length;
  
  // Find start index
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (events[mid].timestamp >= startTime) {
      startIndex = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  // Find end index
  let endIndex = startIndex;
  while (endIndex < events.length && events[endIndex].timestamp <= endTime) {
    endIndex++;
  }
  
  return events.slice(startIndex, endIndex);
}
```

## Network Optimization

### Connection Pooling

```javascript
// Reuse connections for better performance
class ConnectionPool {
  constructor(maxConnections = 10) {
    this.pool = [];
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
  }
  
  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return this.createConnection();
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(checkInterval);
          resolve(this.pool.pop());
        }
      }, 100);
    });
  }
  
  releaseConnection(conn) {
    if (this.pool.length < this.maxConnections) {
      this.pool.push(conn);
    } else {
      conn.close();
      this.activeConnections--;
    }
  }
}
```

### Request Batching

```javascript
// Batch multiple requests to reduce network overhead
class BatchedAdapter {
  constructor(adapter, batchSize = 100, batchInterval = 100) {
    this.adapter = adapter;
    this.batchSize = batchSize;
    this.batchInterval = batchInterval;
    this.batch = [];
    this.batchTimer = null;
  }
  
  async query(params) {
    return new Promise((resolve, reject) => {
      this.batch.push({ params, resolve, reject });
      
      if (this.batch.length >= this.batchSize) {
        this.flush();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flush(), this.batchInterval);
      }
    });
  }
  
  async flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.batch.length === 0) return;
    
    const currentBatch = this.batch;
    this.batch = [];
    
    try {
      const results = await this.adapter.batchQuery(
        currentBatch.map(b => b.params)
      );
      
      currentBatch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      currentBatch.forEach(item => item.reject(error));
    }
  }
}
```

### Compression

```javascript
const zlib = require('zlib');

// Enable compression for large payloads
class CompressedAdapter {
  async sendRequest(data) {
    const serialized = JSON.stringify(data);
    
    // Compress if large
    if (serialized.length > 1024) {
      const compressed = await promisify(zlib.gzip)(serialized);
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip'
        },
        body: compressed
      });
    }
    
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized
    });
  }
}
```

## Query Optimization

### Query Analysis

```javascript
// Analyze query complexity
function analyzeQuery(query) {
  const parser = new PeggyQueryParser();
  const parsed = parser.parse(query);
  
  return {
    streams: parsed.streams.length,
    timeWindow: parseTimeWindow(parsed.timeRange),
    joinKeys: parsed.joinKeys.length,
    hasFilter: !!parsed.filter,
    hasTemporal: !!parsed.temporal,
    hasGrouping: !!parsed.grouping,
    complexity: calculateComplexity(parsed)
  };
}

function calculateComplexity(parsed) {
  let score = 0;
  score += parsed.streams.length * 10;        // Each stream adds complexity
  score += parsed.joinKeys.length * 5;        // Each join key
  score += parsed.hasFilter ? 20 : 0;         // Filtering overhead
  score += parsed.hasTemporal ? 15 : 0;       // Temporal constraints
  score += parsed.hasGrouping ? 25 : 0;       // Grouping overhead
  
  return {
    score,
    level: score < 30 ? 'simple' : score < 60 ? 'moderate' : 'complex'
  };
}
```

### Query Optimization Strategies

```javascript
// 1. Push filters to source
// Instead of:
const inefficient = `
  (loki({service="frontend"})[10m] 
    and on(request_id) 
    loki({service="backend"})[10m])
  {status="500"}
`;

// Use:
const efficient = `
  loki({service="frontend", status="500"})[10m] 
    and on(request_id) 
    loki({service="backend", status="500"})[10m]
`;

// 2. Reduce time windows
// Instead of:
const largeWindow = 'loki({service="api"})[1h]';

// Use:
const smallWindow = 'loki({service="api"})[5m]';

// 3. Use specific join keys
// Instead of:
const multipleKeys = 'and on(request_id, session_id, user_id)';

// Use:
const singleKey = 'and on(request_id)';

// 4. Limit result set early
async function optimizedQuery(engine, query) {
  const limit = 1000;
  const results = [];
  
  for await (const correlation of engine.correlate(query)) {
    results.push(correlation);
    if (results.length >= limit) break; // Stop early
  }
  
  return results;
}
```

### Query Caching

```javascript
const crypto = require('crypto');

class QueryCache {
  constructor(ttl = 60000) { // 1 minute TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  getCacheKey(query, options) {
    const hash = crypto.createHash('sha256');
    hash.update(query);
    hash.update(JSON.stringify(options));
    return hash.digest('hex');
  }
  
  async execute(engine, query, options = {}) {
    const key = this.getCacheKey(query, options);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.results;
    }
    
    const results = [];
    for await (const correlation of engine.correlate(query)) {
      results.push(correlation);
    }
    
    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
    
    // Clean old entries
    this.cleanup();
    
    return results;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
```

## Scaling Strategies

### Horizontal Scaling

```javascript
// Distribute correlation across multiple instances
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  // Master process
  const workers = [];
  
  for (let i = 0; i < numCPUs; i++) {
    workers.push(cluster.fork());
  }
  
  // Load balancing
  let currentWorker = 0;
  
  async function distributeQuery(query) {
    const worker = workers[currentWorker];
    currentWorker = (currentWorker + 1) % workers.length;
    
    return new Promise((resolve) => {
      worker.send({ type: 'query', query });
      worker.once('message', (msg) => {
        if (msg.type === 'result') {
          resolve(msg.results);
        }
      });
    });
  }
} else {
  // Worker process
  const engine = new CorrelationEngine(workerConfig);
  
  process.on('message', async (msg) => {
    if (msg.type === 'query') {
      const results = [];
      for await (const correlation of engine.correlate(msg.query)) {
        results.push(correlation);
      }
      process.send({ type: 'result', results });
    }
  });
}
```

### Sharding

```javascript
// Shard data by time or key
class ShardedEngine {
  constructor(shardCount = 4) {
    this.shards = [];
    for (let i = 0; i < shardCount; i++) {
      this.shards.push(new CorrelationEngine({
        shardId: i,
        shardCount: shardCount
      }));
    }
  }
  
  getShardForEvent(event) {
    // Shard by request_id hash
    const hash = crypto.createHash('sha256')
      .update(event.joinKeys.request_id || '')
      .digest();
    const shardIndex = hash[0] % this.shards.length;
    return this.shards[shardIndex];
  }
  
  async *correlate(query) {
    // Query all shards in parallel
    const streams = this.shards.map(shard => shard.correlate(query));
    
    // Merge results
    yield* this.mergeStreams(streams);
  }
  
  async *mergeStreams(streams) {
    const iterators = streams.map(s => s[Symbol.asyncIterator]());
    const pending = new Set(iterators);
    
    while (pending.size > 0) {
      const promises = Array.from(pending).map(it => 
        it.next().then(result => ({ iterator: it, result }))
      );
      
      const { iterator, result } = await Promise.race(promises);
      
      if (result.done) {
        pending.delete(iterator);
      } else {
        yield result.value;
      }
    }
  }
}
```

## Performance Monitoring

### Real-Time Metrics

```javascript
const { PerformanceMonitor } = require('@liquescent/log-correlator-core');

class DetailedMonitor extends PerformanceMonitor {
  constructor() {
    super(1000); // 1 second intervals
    this.metrics = {
      events: 0,
      correlations: 0,
      errors: 0,
      latencies: []
    };
  }
  
  recordEvent(type, duration) {
    this.metrics.events++;
    this.metrics.latencies.push(duration);
    
    // Keep only last 1000 latencies
    if (this.metrics.latencies.length > 1000) {
      this.metrics.latencies.shift();
    }
  }
  
  getStatistics() {
    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    return {
      count: this.metrics.events,
      correlations: this.metrics.correlations,
      errors: this.metrics.errors,
      throughput: this.metrics.events / (this.uptime / 1000),
      latency: {
        min: Math.min(...sorted),
        max: Math.max(...sorted),
        avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      }
    };
  }
}

// Use monitor
const monitor = new DetailedMonitor();
monitor.start();

setInterval(() => {
  const stats = monitor.getStatistics();
  console.log('Performance Stats:', stats);
  
  // Alert on degradation
  if (stats.latency.p95 > 200) {
    console.warn('High latency detected!');
  }
  if (stats.throughput < 100) {
    console.warn('Low throughput detected!');
  }
}, 5000);
```

### Performance Dashboard

```javascript
// Export metrics for monitoring tools
const prometheus = require('prom-client');

// Create metrics
const eventCounter = new prometheus.Counter({
  name: 'correlation_events_total',
  help: 'Total number of events processed'
});

const correlationHistogram = new prometheus.Histogram({
  name: 'correlation_duration_seconds',
  help: 'Correlation duration in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const memoryGauge = new prometheus.Gauge({
  name: 'correlation_memory_bytes',
  help: 'Memory usage in bytes'
});

// Track metrics
engine.on('correlationFound', (correlation) => {
  eventCounter.inc();
  correlationHistogram.observe(correlation.duration / 1000);
});

setInterval(() => {
  memoryGauge.set(process.memoryUsage().heapUsed);
}, 10000);

// Expose metrics endpoint
const express = require('express');
const app = express();

app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});

app.listen(9090);
```

## Best Practices Summary

### Configuration Checklist

- [ ] Set appropriate time windows for your use case
- [ ] Configure memory limits based on available resources
- [ ] Enable deduplication for duplicate-prone sources
- [ ] Use indexed storage for large datasets
- [ ] Configure parallel processing for multi-core systems
- [ ] Set up monitoring and alerting
- [ ] Implement query caching for repeated queries
- [ ] Use connection pooling for network efficiency
- [ ] Enable compression for large payloads
- [ ] Configure garbage collection intervals

### Performance Testing Checklist

- [ ] Benchmark with realistic data volumes
- [ ] Test with peak load scenarios
- [ ] Monitor memory usage over time
- [ ] Profile CPU hotspots
- [ ] Measure network latency
- [ ] Test query complexity limits
- [ ] Verify cleanup and GC effectiveness
- [ ] Test failover and recovery
- [ ] Measure startup and shutdown times
- [ ] Validate metrics accuracy