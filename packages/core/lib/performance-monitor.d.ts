import { EventEmitter } from 'eventemitter3';
export interface PerformanceMetrics {
    eventsProcessed: number;
    correlationsFound: number;
    averageLatency: number;
    throughput: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    errors: number;
    startTime: number;
    uptime: number;
}
export declare class PerformanceMonitor extends EventEmitter {
    private intervalMs;
    private metrics;
    private latencies;
    private lastThroughputCheck;
    private lastEventCount;
    private monitoringInterval?;
    constructor(intervalMs?: number);
    start(): void;
    stop(): void;
    recordEvent(startTime: number): void;
    recordCorrelation(): void;
    recordError(): void;
    private updateMetrics;
    getMetrics(): PerformanceMetrics;
    reset(): void;
}
//# sourceMappingURL=performance-monitor.d.ts.map