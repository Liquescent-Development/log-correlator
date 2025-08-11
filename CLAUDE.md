# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript npm package that enables real-time correlation of log streams from multiple sources (Loki, Graylog) with a PromQL-inspired query language. Designed for consumption by JavaScript Electron applications.

## Repository Structure

```
log-correlator/
├── packages/
│   ├── core/                     # Main correlation engine
│   ├── adapters/
│   │   ├── loki/                 # Loki adapter
│   │   └── graylog/              # Graylog adapter
│   ├── query-parser/             # Query language parser
│   └── examples/                 # JavaScript usage examples
└── tools/                        # Build tools and scripts
```

## Development Commands

```bash
# Install dependencies (from root)
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

## Architecture

### Core Components

1. **CorrelationEngine** (`packages/core/src/correlation-engine.ts`): Main entry point for correlation operations
2. **StreamJoiner** (`packages/core/src/stream-joiner.ts`): Handles the correlation logic between streams
3. **TimeWindow** (`packages/core/src/time-window.ts`): Manages time-based buffering and windowing
4. **QueryParser** (`packages/query-parser/src/parser.ts`): Parses PromQL-style correlation queries

### Data Source Adapters

- **LokiAdapter**: Supports WebSocket and polling modes for Loki log streams
- **GraylogAdapter**: Polling-based adapter for Graylog log streams

### Query Language

PromQL-inspired syntax supporting:
- Inner joins: `and on(key)`
- Left joins: `or on(key)`
- Anti-joins: `unless on(key)`
- Temporal joins: `within(30s)`
- Grouping: `group_left()`, `group_right()`

Example:
```promql
loki({service="frontend"})[5m] 
  and on(request_id) 
  loki({service="backend"})[5m]
```

## Key Design Principles

- **JavaScript-First API**: Clean CommonJS output for easy JavaScript/Electron consumption
- **Streaming Architecture**: Uses AsyncIterables for memory-efficient processing
- **Real-time Processing**: WebSocket support for live log streaming
- **Memory Bounded**: Configurable limits to prevent memory exhaustion
- **Type Safety**: Full TypeScript with exported type definitions

## Testing

- Unit tests use Jest with ts-jest
- Test files are colocated with source files (`*.test.ts`)
- Run tests with `npm run test` in individual packages or from root

## Important Notes

- The package uses npm workspaces for monorepo management
- Each package can be published independently
- Adapters depend on the core package
- Examples demonstrate vanilla JavaScript usage patterns

## Git Workflow

- Never commit directly to main branch
- Create feature branches for all changes
- Pull requests should be used to merge to main
- Never include co-author information in commits unless explicitly requested