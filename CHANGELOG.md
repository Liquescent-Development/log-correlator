# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features

- Initial implementation of log correlator with TypeScript monorepo structure
- Core correlation engine with real-time stream processing
- PromQL-inspired query language with Peggy parser (no Java dependency)
- Loki adapter with WebSocket and polling support
- Graylog adapter with authentication support
- Event deduplication with SHA256 hashing
- Indexed event storage for O(1) join key lookups
- Parallel processing with worker threads
- Backpressure control for memory management
- Comprehensive JavaScript API for Electron compatibility

### 📦 Build

- TypeScript compilation to CommonJS and ESM
- Minified builds for production
- Source map generation
- npm workspace configuration

### 📝 Documentation

- Complete API documentation
- Troubleshooting guide
- Performance tuning guide
- Migration guide from other tools

### 🔧 Tools

- Build script with minification support
- Release automation script
- Benchmarking tool for performance testing
- Load testing tool with multiple scenarios
- Changelog generation from git commits

## [1.0.0] - TBD

Initial release (placeholder for first official release)

---

## Links

[Unreleased]: https://github.com/liquescent/log-correlator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/liquescent/log-correlator/releases/tag/v1.0.0