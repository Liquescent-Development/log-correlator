"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
const eventemitter3_1 = require("eventemitter3");
class PerformanceMonitor extends eventemitter3_1.EventEmitter {
    constructor(intervalMs = 5000) {
        super();
        this.intervalMs = intervalMs;
        this.latencies = [];
        this.lastEventCount = 0;
        const now = Date.now();
        this.metrics = {
            eventsProcessed: 0,
            correlationsFound: 0,
            averageLatency: 0,
            throughput: 0,
            memoryUsage: {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                rss: 0
            },
            errors: 0,
            startTime: now,
            uptime: 0
        };
        this.lastThroughputCheck = now;
    }
    start() {
        if (this.monitoringInterval) {
            return;
        }
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
            this.emit('metrics', this.getMetrics());
        }, this.intervalMs);
    }
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
    }
    recordEvent(startTime) {
        this.metrics.eventsProcessed++;
        const latency = Date.now() - startTime;
        this.latencies.push(latency);
        // Keep only last 1000 latencies to avoid memory growth
        if (this.latencies.length > 1000) {
            this.latencies.shift();
        }
    }
    recordCorrelation() {
        this.metrics.correlationsFound++;
    }
    recordError() {
        this.metrics.errors++;
    }
    updateMetrics() {
        const now = Date.now();
        // Update uptime
        this.metrics.uptime = now - this.metrics.startTime;
        // Calculate average latency
        if (this.latencies.length > 0) {
            const sum = this.latencies.reduce((a, b) => a + b, 0);
            this.metrics.averageLatency = sum / this.latencies.length;
        }
        // Calculate throughput (events per second)
        const timeDiff = (now - this.lastThroughputCheck) / 1000;
        const eventDiff = this.metrics.eventsProcessed - this.lastEventCount;
        this.metrics.throughput = eventDiff / timeDiff;
        this.lastThroughputCheck = now;
        this.lastEventCount = this.metrics.eventsProcessed;
        // Update memory usage
        const memUsage = process.memoryUsage();
        this.metrics.memoryUsage = {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        };
        // Check for high memory usage
        const memoryMB = memUsage.heapUsed / 1024 / 1024;
        if (memoryMB > 100) {
            this.emit('highMemoryUsage', { usedMB: memoryMB });
        }
        // Check for performance issues
        if (this.metrics.averageLatency > 100) {
            this.emit('highLatency', { averageMs: this.metrics.averageLatency });
        }
        if (this.metrics.throughput < 10 && this.metrics.eventsProcessed > 100) {
            this.emit('lowThroughput', { eventsPerSecond: this.metrics.throughput });
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    reset() {
        const now = Date.now();
        this.metrics = {
            eventsProcessed: 0,
            correlationsFound: 0,
            averageLatency: 0,
            throughput: 0,
            memoryUsage: {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                rss: 0
            },
            errors: 0,
            startTime: now,
            uptime: 0
        };
        this.latencies = [];
        this.lastThroughputCheck = now;
        this.lastEventCount = 0;
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=performance-monitor.js.map