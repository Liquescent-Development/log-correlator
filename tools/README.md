# Log Correlator Tools

This directory contains build, development, and testing tools for the log-correlator project.

## Available Tools

### 🔨 Build Script (`build.js`)

Handles TypeScript compilation, minification, and packaging.

```bash
# Standard build
node tools/build.js

# Clean build with minification
node tools/build.js --clean --minify

# Watch mode for development
node tools/build.js --watch

# Verbose output
node tools/build.js --verbose
```

Options:

- `--clean` - Clean build artifacts before building
- `--minify` - Generate minified versions
- `--no-sourcemaps` - Disable source map generation
- `--watch` - Watch mode for development
- `--verbose` - Show detailed output

### 🚀 Release Script (`release.js`)

Automates versioning, npm publishing, and GitHub releases.

```bash
# Patch release (1.0.0 -> 1.0.1)
node tools/release.js

# Minor release (1.0.0 -> 1.1.0)
node tools/release.js minor

# Major release (1.0.0 -> 2.0.0)
node tools/release.js major

# Dry run (no changes)
node tools/release.js --dry-run

# Pre-release
node tools/release.js prerelease --prerelease
```

Options:

- Version types: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`
- `--dry-run` - Run without making changes
- `--skip-tests` - Skip running tests
- `--skip-build` - Skip building packages
- `--prerelease` - Mark as pre-release
- `--no-npm` - Skip npm publishing
- `--no-github` - Skip GitHub release

### 📊 Benchmark Tool (`benchmark.js`)

Measures performance, memory usage, and throughput.

```bash
# Run simple benchmark
node tools/benchmark.js simple

# Run complex correlation benchmark
node tools/benchmark.js complex

# High throughput test
node tools/benchmark.js throughput

# With profiling
node tools/benchmark.js simple --profile

# Save report
node tools/benchmark.js complex --output report.json
```

Scenarios:

- `simple` - Basic two-stream correlation
- `complex` - Multi-stream correlation with filters
- `throughput` - High-throughput parallel queries

Options:

- `--duration <ms>` - Test duration (default: 60000)
- `--events <n>` - Events per second (default: 1000)
- `--window <size>` - Time window size (default: 5m)
- `--profile` - Enable CPU and memory profiling
- `--verbose` - Show detailed output
- `--output <file>` - Save report to JSON file

### 🏋️ Load Test Tool (`load-test.js`)

Simulates real-world load patterns and stress tests.

```bash
# Run default load test
node tools/load-test.js

# Custom configuration
node tools/load-test.js --workers 4 --rps 500

# Stress test with spike pattern
node tools/load-test.js --scenario stress --pattern spike

# Short test with report
node tools/load-test.js --duration 60000 --report
```

Options:

- `--workers <n>` - Number of worker processes (default: CPU cores)
- `--duration <ms>` - Test duration (default: 300000)
- `--rps <n>` - Target requests per second (default: 1000)
- `--scenario <name>` - Test scenario: `simple`, `mixed`, `complex`, `stress`
- `--pattern <name>` - Load pattern: `steady`, `ramp`, `spike`, `wave`, `stress`
- `--report` - Save detailed JSON report

### 📝 Changelog Generator (`changelog.js`)

Generates and maintains CHANGELOG.md from git commits.

```bash
# Generate complete changelog
node tools/changelog.js --all

# Generate unreleased changes only
node tools/changelog.js --unreleased

# Generate for specific range
node tools/changelog.js --from=v1.0.0 --to=v2.0.0

# Dry run (preview without writing)
node tools/changelog.js --dry-run --unreleased
```

Options:

- `--unreleased` - Generate only unreleased changes
- `--all` - Generate complete changelog
- `--from=<ref>` - Generate from specific ref/tag
- `--to=<ref>` - Generate to specific ref/tag (default: HEAD)
- `--output=<file>` - Output file (default: CHANGELOG.md)
- `--no-other` - Hide commits without type
- `--dry-run` - Show output without writing

### 👨‍💻 Development Mode (`dev.js`)

Provides watch mode, auto-reload, and development utilities.

```bash
# Start development mode
node tools/dev.js

# With testing and linting
node tools/dev.js --test --lint

# Verbose mode
node tools/dev.js --verbose
```

Options:

- `--no-watch` - Disable file watching
- `--test` - Enable test runner in watch mode
- `--lint` - Enable linting on file changes
- `--typecheck` - Enable type checking
- `--verbose` - Show detailed output

Keyboard commands during execution:

- `r` - Restart all processes
- `t` - Run tests
- `l` - Run linter
- `c` - Clear console
- `q` - Quit

## Installation

Install tool dependencies:

```bash
cd tools
npm install
```

## Environment Variables

Many tools support environment variables for configuration:

- `BENCHMARK_DURATION` - Benchmark test duration
- `EVENTS_PER_SECOND` - Event generation rate
- `LOAD_TEST_WORKERS` - Number of load test workers
- `LOAD_TEST_DURATION` - Load test duration
- `TARGET_RPS` - Target requests per second
- `SCENARIO` - Test scenario name

## CI/CD Integration

These tools can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Build
  run: node tools/build.js --clean --minify

- name: Test
  run: npm test

- name: Benchmark
  run: node tools/benchmark.js simple --output benchmark.json

- name: Release
  if: github.ref == 'refs/heads/main'
  run: node tools/release.js --skip-tests
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Contributing

When adding new tools:

1. Follow the existing pattern for CLI argument parsing
2. Include `--help` documentation
3. Add appropriate error handling
4. Update this README with usage examples
5. Add any required dependencies to `tools/package.json`
