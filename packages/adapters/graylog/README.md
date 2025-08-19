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
  apiToken: "your-api-token", // API token recommended for v6
  apiVersion: "v6", // Required for Graylog 6.x
  pollInterval: 2000,
  streamId: "stream-id", // Optional: filter by specific stream
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

- `POST /api/views/search/messages` - Search for log messages with CSV response
- `GET /api/streams` - List available streams

The v6 API requires a specific nested request structure with these key differences:
- Uses `query_string.query_string` (nested structure) instead of a simple query parameter
- Timerange uses `type: "relative"` with `from: <seconds>` format 
- Uses `fields_in_order` instead of `fields` for field specification
- Always returns CSV format (Accept: "text/csv") instead of JSON
- Supports optional `streams` array for filtering by stream IDs

#### Graylog v6 API Request Structure

The adapter sends requests to `/api/views/search/messages` with this exact structure:

```json
{
  "query_string": {
    "query_string": "*"
  },
  "timerange": {
    "type": "relative",
    "from": 300
  },
  "fields_in_order": ["timestamp", "source", "message", "_id"],
  "limit": 1000,
  "chunk_size": 1000,
  "streams": ["optional-stream-id"]
}
```

**Key Requirements:**
- The `query_string.query_string` nesting is required (not a typo)
- `timerange.from` must be in seconds (e.g., 300 for last 5 minutes)
- `timerange.type` must be "relative" for relative time queries
- Response is always in CSV format regardless of Accept header
- Stream filtering is done via the `streams` array, not query parameters

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
    apiVersion: "v6", // Use v6 API for Graylog 6.x+ (returns CSV)
    streamId: "optional-stream-id", // Filter by specific stream if needed
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
| `proxy`        | object           | -        | SOCKS proxy configuration        |

## SOCKS Proxy Support

The Graylog adapter supports connecting through SOCKS4/SOCKS5 proxies, which is useful for accessing Graylog instances in restricted network environments:

```javascript
const adapter = new GraylogAdapter({
  url: "http://graylog.internal:9000",
  apiToken: "your-token",
  apiVersion: "v6",
  proxy: {
    host: "127.0.0.1",
    port: 1080,
    type: 5, // SOCKS5 (default) or 4 for SOCKS4
    username: "proxyuser", // Optional
    password: "proxypass", // Optional
  },
});
```

### Proxy Configuration Options

| Option           | Type   | Default  | Description                       |
| ---------------- | ------ | -------- | --------------------------------- |
| `proxy.host`     | string | required | SOCKS proxy hostname or IP        |
| `proxy.port`     | number | required | SOCKS proxy port                  |
| `proxy.type`     | 4 \| 5 | 5        | SOCKS protocol version            |
| `proxy.username` | string | -        | Username for proxy authentication |
| `proxy.password` | string | -        | Password for proxy authentication |

### Use Cases

- Accessing internal Graylog instances from external networks
- Connecting through bastion hosts or jump servers
- Complying with enterprise security policies
- Tunneling through firewalls in restricted environments

## Version-Specific Notes

### Graylog 6.x Permissions

For Graylog 6.x, ensure your user has access to:
- The Views Search API (`/api/views/search/messages`)
- Read permissions on the streams you want to query
- Export permissions if your Graylog deployment restricts CSV exports

The v6 API is significantly different from the legacy Universal Search API:
- It only returns CSV data (not JSON)
- The request structure uses nested `query_string.query_string` format
- Timerange format is different (relative seconds vs. absolute timestamps)
- Field selection uses `fields_in_order` array instead of comma-separated string

### Migration from Legacy to v6

When upgrading from legacy to v6 API, simply change the `apiVersion` setting:

```javascript
// Before (Graylog 2.x-5.x)
apiVersion: "legacy"

// After (Graylog 6.x+)  
apiVersion: "v6"
```

The adapter handles all the underlying API differences automatically.
