# Graylog Adapter for Log Correlator

This adapter enables the Log Correlator to connect to and consume logs from Graylog instances.

## Installation

```bash
npm install @liquescent/log-correlator-graylog
```

## Supported Graylog Versions

The adapter supports multiple Graylog versions through configurable API endpoints:

- **Graylog 2.x - 5.x**: Uses the Universal Search API (`/api/search/universal/relative`)
- **Graylog 6.x+**: Uses the Views Search API (`/api/views/search/messages`)

## Configuration

```javascript
const { GraylogAdapter } = require("@liquescent/log-correlator-graylog");

// For Graylog 2.x - 5.x (default)
const legacyAdapter = new GraylogAdapter({
  url: "http://graylog.example.com:9000",
  username: "admin",
  password: "password",
  apiVersion: "legacy", // Optional, this is the default
  pollInterval: 2000, // Poll every 2 seconds
  timeout: 15000, // 15 second timeout
});

// For Graylog 6.x+
const v6Adapter = new GraylogAdapter({
  url: "http://graylog.example.com:9000",
  apiToken: "your-api-token",
  apiVersion: "v6", // Required for Graylog 6.x
  pollInterval: 2000,
  streamId: "stream-id", // Optional: filter by stream
});
```

## Authentication

The adapter supports two authentication methods:

1. **Basic Authentication** (username/password)
2. **API Token Authentication** (recommended for production)

```javascript
// Basic auth
const adapter = new GraylogAdapter({
  url: "http://graylog.example.com:9000",
  username: "admin",
  password: "password",
});

// API token
const adapter = new GraylogAdapter({
  url: "http://graylog.example.com:9000",
  apiToken: "your-api-token",
});
```

## API Endpoints Used

### Legacy API (Graylog 2.x - 5.x)

- `GET /api/search/universal/relative` - Search for log messages
- `GET /api/streams` - List available streams

### Views API (Graylog 6.x+)

- `POST /api/views/search/messages` - Search for log messages with CSV export
- `GET /api/streams` - List available streams

## Query Syntax

The adapter converts simplified query syntax to Graylog query format:

```javascript
// Simple field queries
"service:frontend";
"level:error";

// Quoted values
'service="frontend"';
'message="error occurred"';

// Boolean operators
"service:frontend AND level:error";
"service:frontend OR service:backend";
```

## Usage Example

```javascript
const { CorrelationEngine } = require("@liquescent/log-correlator-core");
const { GraylogAdapter } = require("@liquescent/log-correlator-graylog");

const engine = new CorrelationEngine();

// Add Graylog adapter
engine.addAdapter(
  "graylog",
  new GraylogAdapter({
    url: "http://graylog.example.com:9000",
    apiToken: "your-token",
    apiVersion: "v6", // For Graylog 6.x
  }),
);

// Query logs
const query = "graylog(service:api AND level:error)[5m]";

for await (const event of engine.correlate(query)) {
  console.log("Log event:", event);
}
```

## Features

- **Polling-based streaming**: Continuously polls for new log messages
- **Automatic retry**: Handles transient failures with exponential backoff
- **Join key extraction**: Automatically extracts correlation IDs from log messages
- **Stream filtering**: Filter logs by Graylog stream ID
- **Time window support**: Configure time ranges for log queries

## Options

| Option         | Type             | Default  | Description                      |
| -------------- | ---------------- | -------- | -------------------------------- |
| `url`          | string           | required | Graylog server URL               |
| `username`     | string           | -        | Username for basic auth          |
| `password`     | string           | -        | Password for basic auth          |
| `apiToken`     | string           | -        | API token for token auth         |
| `apiVersion`   | 'legacy' \| 'v6' | 'legacy' | API version to use               |
| `pollInterval` | number           | 2000     | Polling interval in milliseconds |
| `timeout`      | number           | 15000    | Request timeout in milliseconds  |
| `maxRetries`   | number           | 3        | Maximum retry attempts           |
| `streamId`     | string           | -        | Filter by Graylog stream ID      |

## Note on Permissions

For Graylog 6.x, ensure your user has access to the Views Search API (`/api/views/search/messages`). Some enterprise deployments may restrict access to the Universal Search API, in which case you should use `apiVersion: 'v6'`.
