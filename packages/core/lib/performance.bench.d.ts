interface BenchmarkResult {
    name: string;
    duration: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    eventsProcessed: number;
    correlationsFound: number;
    throughput: number;
}
interface BenchmarkOptions {
    warmupRuns?: number;
    benchmarkRuns?: number;
    eventCounts?: number[];
    timeWindows?: string[];
    joinTypes?: Array<'inner' | 'left' | 'outer'>;
}
declare class PerformanceBenchmark {
    private results;
    /**
     * Generate synthetic log events for testing
     */
    private generateEvents;
    /**
     * Generate correlated events across multiple sources
     */
    private generateCorrelatedEvents;
    /**
     * Measure memory usage
     */
    private getMemoryUsage;
    /**
     * Run a single benchmark
     */
    private runBenchmark;
    /**
     * Benchmark different join types
     */
    benchmarkJoinTypes(options?: BenchmarkOptions): Promise<void>;
    /**
     * Benchmark different data volumes
     */
    benchmarkDataVolumes(options?: BenchmarkOptions): Promise<void>;
    /**
     * Benchmark different time window sizes
     */
    benchmarkTimeWindows(options?: BenchmarkOptions): Promise<void>;
    /**
     * Benchmark multi-stream correlations
     */
    benchmarkMultiStream(_options?: BenchmarkOptions): Promise<void>;
    /**
     * Benchmark memory usage under load
     */
    benchmarkMemoryUsage(): Promise<void>;
    /**
     * Benchmark late-arriving events
     */
    benchmarkLateEvents(): Promise<void>;
    /**
     * Stress test with high-frequency events
     */
    stressTest(): Promise<void>;
    /**
     * Print benchmark result
     */
    private printResult;
    /**
     * Generate comprehensive benchmark report
     */
    generateReport(): void;
    /**
     * Export results to JSON
     */
    exportResults(filename?: string): void;
    /**
     * Run all benchmarks
     */
    runAllBenchmarks(options?: BenchmarkOptions): Promise<void>;
}
export { PerformanceBenchmark, BenchmarkResult, BenchmarkOptions };
//# sourceMappingURL=performance.bench.d.ts.map