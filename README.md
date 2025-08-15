# Log Correlator

A TypeScript npm package that enables real-time correlation of log streams from multiple sources (Loki, Graylog) with a PromQL-inspired query language.

## Features

- **Real-time Stream Processing**: Handle live log streams from multiple sources simultaneously
- **PromQL-style Query Language**: Familiar syntax for join operations and filtering
- **Multiple Data Sources**: Built-in adapters for Loki and Graylog
- **JavaScript-First API**: Easy consumption from vanilla JavaScript/Node.js
- **Memory Efficient**: Bounded buffers with configurable time windows
- **Electron Compatible**: Designed for integration with Electron applications

## Installation

> ⚠️ **Pre-release Software**: This is version 0.0.1 - API may change significantly before 1.0.0

```bash
npm install @liquescent/log-correlator-core@^0.0.1
npm install @liquescent/log-correlator-loki@^0.0.1     # Optional: Loki adapter
npm install @liquescent/log-correlator-graylog@^0.0.1  # Optional: Graylog adapter
```

## Quick Start

```javascript
const { CorrelationEngine } = require("@liquescent/log-correlator-core");
const { LokiAdapter } = require("@liquescent/log-correlator-loki");

const engine = new CorrelationEngine({
  timeWindow: 30000, // 30 second window
  maxEvents: 10000, // Memory limit
});

// Add data source adapter
engine.addAdapter(
  "loki",
  new LokiAdapter({
    url: "http://localhost:3100",
  }),
);

// Execute correlation query
const query = `
  loki({service="frontend"})[5m] 
    and on(request_id) 
    loki({service="backend"})[5m]
`;

// Stream results
for await (const correlation of engine.correlate(query)) {
  console.log("Correlated events:", correlation);
}
```

## Query Language

The package supports a PromQL-inspired syntax for correlating log streams:

### Basic Join

```promql
loki({service="frontend"})[5m]
  and on(request_id)
  loki({service="backend"})[5m]
```

### Cross-Source Correlation

```promql
loki({job="nginx"})[5m]
  and on(request_id)
  graylog(service:api)[5m]
```

### Temporal Join

```promql
loki({service="frontend"})[5m]
  and on(request_id) within(30s)
  loki({service="backend"})[5m]
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Documentation

See the [docs](./docs) directory for detailed documentation.

## License

AGPLv3
