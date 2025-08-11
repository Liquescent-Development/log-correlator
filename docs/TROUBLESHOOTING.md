# Troubleshooting Guide

## Table of Contents
- [Common Issues](#common-issues)
- [Connection Errors](#connection-errors)
- [Query Errors](#query-errors)
- [Performance Issues](#performance-issues)
- [Memory Management](#memory-management)
- [Debugging Correlations](#debugging-correlations)
- [Error Codes Reference](#error-codes-reference)

## Common Issues

### No Correlations Found

**Problem**: Query returns no correlations despite matching events existing.

**Possible Causes**:
1. Time window too narrow
2. Join keys don't match exactly
3. Events arriving out of order beyond late tolerance

**Solutions**:
```javascript
// Increase time window
const engine = new CorrelationEngine({
  defaultTimeWindow: '10m',  // Increase from default 5m
  lateTolerance: 60000        // Allow 60 seconds for late events
});

// Debug join keys
engine.on('debugJoinKeys', (event) => {
  console.log('Available join keys:', Object.keys(event.joinKeys));
});

// Use case-insensitive matching
const query = `
  loki({service="frontend"})[10m] 
    and on(lower(request_id)) 
    loki({service="backend"})[10m]
`;
```

### Incomplete Correlations

**Problem**: Some events are missing from correlations.

**Solutions**:
```javascript
// Use left join to see all events from primary stream
const query = `
  loki({service="frontend"})[5m] 
    or on(request_id) 
    loki({service="backend"})[5m]
`;

// Check metadata for partial correlations
for await (const correlation of engine.correlate(query)) {
  if (correlation.metadata.completeness === 'partial') {
    console.log('Missing streams:', 
      correlation.metadata.totalStreams - correlation.metadata.matchedStreams.length
    );
  }
}
```

## Connection Errors

### Loki Connection Failed

**Error**: `ADAPTER_ERROR: Failed to connect to Loki`

**Solutions**:
```javascript
// 1. Verify Loki is running
// curl http://localhost:3100/ready

// 2. Configure timeout and retries
const lokiAdapter = new LokiAdapter({
  url: 'http://localhost:3100',
  timeout: 60000,        // Increase timeout
  maxRetries: 5,         // More retry attempts
  retryDelay: 2000       // Wait between retries
});

// 3. Use polling instead of WebSocket
const lokiAdapter = new LokiAdapter({
  url: 'http://localhost:3100',
  websocket: false,      // Disable WebSocket
  pollInterval: 2000     // Poll every 2 seconds
});

// 4. Add authentication if required
const lokiAdapter = new LokiAdapter({
  url: 'http://localhost:3100',
  authToken: 'Bearer YOUR_TOKEN',
  headers: {
    'X-Scope-OrgID': 'your-org'
  }
});
```

### Graylog Connection Failed

**Error**: `ADAPTER_ERROR: Graylog authentication failed`

**Solutions**:
```javascript
// 1. Use API token instead of username/password
const graylogAdapter = new GraylogAdapter({
  url: 'http://localhost:9000',
  apiToken: 'your-api-token'  // Preferred over username/password
});

// 2. Verify API endpoint
// curl -u admin:password http://localhost:9000/api/system/sessions

// 3. Check SSL/TLS configuration
const graylogAdapter = new GraylogAdapter({
  url: 'https://graylog.example.com',
  rejectUnauthorized: false  // For self-signed certificates (dev only!)
});
```

## Query Errors

### Parse Errors

**Error**: `QUERY_PARSE_ERROR: Unexpected token`

**Common Issues**:
```javascript
// Missing quotes around label values
// WRONG:
const query = 'loki({service=frontend})[5m]';

// CORRECT:
const query = 'loki({service="frontend"})[5m]';

// Missing parentheses around join keys
// WRONG:
const query = 'loki({service="a"})[5m] and on request_id loki({service="b"})[5m]';

// CORRECT:
const query = 'loki({service="a"})[5m] and on(request_id) loki({service="b"})[5m]';

// Invalid time range format
// WRONG:
const query = 'loki({service="frontend"})[5 minutes]';

// CORRECT:
const query = 'loki({service="frontend"})[5m]';
```

**Validation Helper**:
```javascript
// Always validate queries before execution
const parser = new PeggyQueryParser();
const result = parser.validate(query);

if (!result.valid) {
  console.error('Query error at position', result.error.location);
  console.error('Expected:', result.error.expected);
  
  // Show error location
  const lines = query.split('\n');
  const errorLine = lines[result.error.location.line - 1];
  console.error(errorLine);
  console.error(' '.repeat(result.error.location.column - 1) + '^');
}
```

### Unsupported Query Features

**Error**: `QUERY_PARSE_ERROR: Unsupported operation`

**Solutions**:
```javascript
// Use QueryBuilder for complex queries
const { QueryBuilder } = require('@liquescent/log-correlator-query-parser');

const builder = new QueryBuilder();
const query = builder
  .addStream('loki', '{service="frontend"}', '5m')
  .join('and', ['request_id'])
  .withTemporal('30s')
  .andStream('loki', '{service="backend"}', '5m')
  .build();

// This ensures valid syntax
console.log('Generated query:', query);
```

## Performance Issues

### Slow Query Execution

**Problem**: Queries take too long to return results.

**Diagnostics**:
```javascript
const { PerformanceMonitor } = require('@liquescent/log-correlator-core');

const monitor = new PerformanceMonitor(1000);
monitor.start();

monitor.on('metrics', (metrics) => {
  console.log(`
    Events/sec: ${metrics.throughput}
    Avg latency: ${metrics.averageLatency}ms
    Memory: ${metrics.memoryUsage.heapUsed / 1024 / 1024}MB
  `);
});

// Identify bottlenecks
engine.on('performanceMetrics', (metrics) => {
  if (metrics.parsingTime > 100) {
    console.warn('Slow parsing:', metrics.parsingTime, 'ms');
  }
  if (metrics.correlationTime > 500) {
    console.warn('Slow correlation:', metrics.correlationTime, 'ms');
  }
});
```

**Optimizations**:
```javascript
// 1. Use event deduplication
const { EventDeduplicator } = require('@liquescent/log-correlator-core');
const dedup = new EventDeduplicator({ windowSize: 60000 });

// 2. Enable parallel processing
const { ParallelProcessor } = require('@liquescent/log-correlator-core');
const processor = new ParallelProcessor({ maxWorkers: 4 });

// 3. Use indexed storage for large datasets
const { IndexedEventStore } = require('@liquescent/log-correlator-core');
const store = new IndexedEventStore();

// 4. Reduce time windows
const engine = new CorrelationEngine({
  defaultTimeWindow: '2m',  // Smaller window = less memory
  bufferSize: 500           // Smaller buffer = faster processing
});

// 5. Filter at source
const query = `
  loki({service="frontend", level="error"})[2m] 
    and on(request_id) 
    loki({service="backend", level="error"})[2m]
`;
```

### High CPU Usage

**Solutions**:
```javascript
// 1. Increase processing interval
const engine = new CorrelationEngine({
  processingInterval: 500  // Check less frequently (default: 100ms)
});

// 2. Limit parallel workers
const processor = new ParallelProcessor({
  maxWorkers: 2  // Reduce from default 4
});

// 3. Use backpressure control
const { BackpressureController } = require('@liquescent/log-correlator-core');
const controller = new BackpressureController({
  highWaterMark: 500,  // Pause at 500 items
  lowWaterMark: 100    // Resume at 100 items
});
```

## Memory Management

### Memory Leak Detection

**Monitoring Memory Usage**:
```javascript
// Track memory over time
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`
    Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB
    Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB
    RSS: ${(usage.rss / 1024 / 1024).toFixed(2)}MB
  `);
}, 5000);

// Set memory limit
const engine = new CorrelationEngine({
  maxMemoryMB: 50  // Limit to 50MB
});

engine.on('memoryWarning', ({ usedMB }) => {
  console.warn(`Memory usage high: ${usedMB}MB`);
  // Consider stopping correlation
});
```

### Out of Memory Errors

**Error**: `MEMORY_ERROR: Heap out of memory`

**Solutions**:
```javascript
// 1. Reduce buffer sizes
const engine = new CorrelationEngine({
  maxEvents: 1000,        // Reduce from 10000
  bufferSize: 100,        // Smaller buffers
  gcInterval: 10000       // More frequent GC
});

// 2. Enable streaming mode (don't accumulate results)
async function streamResults(query) {
  for await (const correlation of engine.correlate(query)) {
    // Process immediately, don't store
    await sendToDatabase(correlation);
    
    // Allow GC to clean up
    if (global.gc) global.gc();
  }
}

// 3. Use time-based cleanup
const engine = new CorrelationEngine({
  defaultTimeWindow: '1m',   // Smaller windows
  cleanupInterval: 30000     // Clean old windows every 30s
});

// 4. Monitor and abort if needed
let eventCount = 0;
for await (const correlation of engine.correlate(query)) {
  eventCount++;
  if (eventCount > 10000) {
    console.warn('Too many events, aborting');
    break;
  }
}
```

## Debugging Correlations

### Enable Debug Logging

```javascript
// Set environment variable
process.env.DEBUG = 'log-correlator:*';

// Or programmatically
const engine = new CorrelationEngine({
  debug: true
});

// Listen to debug events
engine.on('debug', (info) => {
  console.log('[DEBUG]', info);
});

engine.on('joinAttempt', ({ leftEvent, rightEvent, matched }) => {
  console.log(`Join attempt: ${matched ? 'MATCHED' : 'NO MATCH'}`);
  console.log('  Left:', leftEvent.joinKeys);
  console.log('  Right:', rightEvent.joinKeys);
});
```

### Trace Correlation Flow

```javascript
// Add trace IDs to track flow
engine.on('eventReceived', (event) => {
  event.traceId = generateTraceId();
  console.log(`[${event.traceId}] Received:`, event.source);
});

engine.on('eventBuffered', (event) => {
  console.log(`[${event.traceId}] Buffered in window`);
});

engine.on('correlationFound', (correlation) => {
  console.log(`Correlation found with ${correlation.events.length} events`);
  correlation.events.forEach(e => {
    console.log(`  - [${e.traceId}] ${e.source}: ${e.message}`);
  });
});
```

### Inspect Time Windows

```javascript
// Monitor window lifecycle
engine.on('windowCreated', ({ windowId, start, end }) => {
  console.log(`Window ${windowId}: ${start} to ${end}`);
});

engine.on('windowClosed', ({ windowId, eventCount, correlationCount }) => {
  console.log(`Window ${windowId} closed:`, {
    events: eventCount,
    correlations: correlationCount
  });
});

// Check for timing issues
engine.on('lateEvent', ({ event, windowEnd, delay }) => {
  console.warn(`Late event by ${delay}ms:`, event.timestamp);
});
```

## Error Codes Reference

| Code | Description | Common Causes | Solutions |
|------|-------------|---------------|-----------|
| `QUERY_PARSE_ERROR` | Invalid query syntax | Typos, missing quotes | Validate query, use QueryBuilder |
| `ADAPTER_ERROR` | Data source error | Connection failed, auth issues | Check connection, credentials |
| `TIMEOUT_ERROR` | Query timeout | Slow network, large dataset | Increase timeout, reduce window |
| `MEMORY_ERROR` | Memory limit exceeded | Too many events | Reduce buffers, enable streaming |
| `JOIN_KEY_ERROR` | Join key not found | Typo in key name | Check available keys in events |
| `STREAM_ERROR` | Stream processing failed | Source unavailable | Check adapter status |
| `VALIDATION_ERROR` | Invalid configuration | Wrong types/values | Check option types |

## Getting Help

### Enable Verbose Logging

```javascript
// Maximum verbosity
const engine = new CorrelationEngine({
  logLevel: 'debug',
  debug: true
});

// Custom logger
engine.setLogger({
  debug: (...args) => console.log('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
});
```

### Collect Diagnostics

```javascript
// Generate diagnostic report
async function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    version: require('@liquescent/log-correlator-core/package.json').version,
    node: process.version,
    memory: process.memoryUsage(),
    adapters: engine.getAdapters().map(a => ({
      name: a.getName(),
      status: a.getStatus()
    })),
    config: engine.getConfig(),
    stats: engine.getStatistics()
  };
  
  require('fs').writeFileSync(
    'correlation-diagnostics.json',
    JSON.stringify(report, null, 2)
  );
  
  console.log('Diagnostic report saved');
  return report;
}
```

### Community Support

- GitHub Issues: Report bugs and feature requests
- Stack Overflow: Tag questions with `log-correlator`
- Documentation: Check `/docs` folder for detailed guides