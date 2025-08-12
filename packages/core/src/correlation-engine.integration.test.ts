import { CorrelationEngine } from './correlation-engine';
import { DataSourceAdapter, LogEvent, CorrelatedEvent } from './types';

// Mock adapter for testing
class MockAdapter implements DataSourceAdapter {
  constructor(private events: LogEvent[]) {}

  async *createStream(selector?: string): AsyncIterable<LogEvent> {
    // Parse the selector to filter events
    const filters = this.parseSelector(selector);
    
    for (const event of this.events) {
      // Apply filters if provided
      if (filters && !this.matchesFilters(event, filters)) {
        continue;
      }
      yield event;
      // Simulate real-time delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  private parseSelector(selector?: string): Record<string, string> | null {
    if (!selector) return null;
    
    const filters: Record<string, string> = {};
    // Parse selector like {service="frontend",level="error"}
    const matches = selector.match(/(\w+)="([^"]+)"/g);
    if (matches) {
      for (const match of matches) {
        const [key, value] = match.split('=');
        filters[key] = value.replace(/"/g, '');
      }
    }
    return filters;
  }

  private matchesFilters(event: LogEvent, filters: Record<string, string>): boolean {
    for (const [key, value] of Object.entries(filters)) {
      if (event.labels?.[key] !== value) {
        return false;
      }
    }
    return true;
  }

  validateQuery(): boolean {
    return true;
  }

  getName(): string {
    return 'mock';
  }

  async destroy(): Promise<void> {
    // Clean up
  }
}

describe('CorrelationEngine Integration', () => {
  let engine: CorrelationEngine;

  beforeEach(() => {
    engine = new CorrelationEngine({
      timeWindow: 5000,
      maxEvents: 100,
      lateTolerance: 1000
    });
  });

  afterEach(async () => {
    await engine.destroy();
  });

  describe('Multi-stream correlation', () => {
    it('should correlate events from multiple streams', async () => {
      const frontendEvents: LogEvent[] = [
        {
          timestamp: new Date().toISOString(),
          source: 'mock',
          message: 'Frontend request',
          labels: { service: 'frontend', request_id: 'req123' }
        },
        {
          timestamp: new Date(Date.now() + 100).toISOString(),
          source: 'mock',
          message: 'Frontend response',
          labels: { service: 'frontend', request_id: 'req123' }
        }
      ];

      const backendEvents: LogEvent[] = [
        {
          timestamp: new Date(Date.now() + 50).toISOString(),
          source: 'mock',
          message: 'Backend processing',
          labels: { service: 'backend', request_id: 'req123' }
        }
      ];

      engine.addAdapter('mock', new MockAdapter([...frontendEvents, ...backendEvents]));

      const query = `
        mock({service="frontend"})[5m]
          and on(request_id)
          mock({service="backend"})[5m]
      `;

      const correlations: CorrelatedEvent[] = [];
      for await (const correlation of engine.correlate(query)) {
        correlations.push(correlation);
      }

      expect(correlations).toHaveLength(1);
      expect(correlations[0].joinValue).toBe('req123');
      expect(correlations[0].events).toHaveLength(3);
    });

    it('should handle temporal joins', async () => {
      const events1: LogEvent[] = [
        {
          timestamp: new Date().toISOString(),
          source: 'mock',
          message: 'Event 1',
          labels: { service: 'service1', correlation_id: 'corr456' }
        }
      ];

      const events2: LogEvent[] = [
        {
          timestamp: new Date(Date.now() + 25000).toISOString(), // 25 seconds later
          source: 'mock',
          message: 'Event 2',
          labels: { service: 'service2', correlation_id: 'corr456' }
        }
      ];

      engine.addAdapter('mock', new MockAdapter([...events1, ...events2]));

      const query = `
        mock({service="service1"})[1m]
          and on(correlation_id) within(20s)
          mock({service="service2"})[1m]
      `;

      const correlations: CorrelatedEvent[] = [];
      for await (const correlation of engine.correlate(query)) {
        correlations.push(correlation);
      }

      // Should not correlate due to temporal constraint
      expect(correlations).toHaveLength(0);
    });

    it('should support label mapping', async () => {
      const events1: LogEvent[] = [
        {
          timestamp: new Date().toISOString(),
          source: 'mock',
          message: 'Session event',
          labels: { service: 'auth', session_id: 'sess789' }
        }
      ];

      const events2: LogEvent[] = [
        {
          timestamp: new Date().toISOString(),
          source: 'mock',
          message: 'Trace event',
          labels: { service: 'api', trace_id: 'sess789' }
        }
      ];

      engine.addAdapter('mock', new MockAdapter([...events1, ...events2]));

      const query = `
        mock({service="auth"})[5m]
          and on(session_id=trace_id)
          mock({service="api"})[5m]
      `;

      const correlations: CorrelatedEvent[] = [];
      for await (const correlation of engine.correlate(query)) {
        correlations.push(correlation);
      }

      expect(correlations).toHaveLength(1);
      expect(correlations[0].joinValue).toBe('sess789');
    });
  });

  describe('Performance monitoring', () => {
    it('should emit performance metrics', async () => {
      const events: LogEvent[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        source: 'mock',
        message: `Event ${i}`,
        labels: { service: 'test', id: `id${i % 10}` }
      }));

      engine.addAdapter('mock', new MockAdapter(events));

      const metricsPromise = new Promise<void>((resolve) => {
        engine.on('performanceMetrics', (metrics) => {
          expect(metrics).toHaveProperty('eventsProcessed');
          expect(metrics).toHaveProperty('throughput');
          expect(metrics).toHaveProperty('memoryUsage');
          resolve();
        });
      });

      const query = `
        mock({service="test"})[5m]
          and on(id)
          mock({service="test"})[5m]
      `;

      // Start correlation to trigger metrics
      const iterator = engine.correlate(query);
      await iterator.next();
      
      // Wait for metrics to be emitted
      await metricsPromise;
    }, 10000);
  });

  describe('Error handling', () => {
    it('should handle missing adapters gracefully', async () => {
      const query = `
        nonexistent({service="test"})[5m]
          and on(id)
          nonexistent({service="test"})[5m]
      `;

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _event of engine.correlate(query)) {
          // Should not reach here
        }
      }).rejects.toThrow('Required data source adapter not found');
    });

    it('should validate queries before execution', () => {
      const validQuery = `
        loki({service="test"})[5m]
          and on(id)
          loki({service="test"})[5m]
      `;

      const invalidQuery = 'this is not a valid query';

      expect(engine.validateQuery(validQuery)).toBe(true);
      expect(engine.validateQuery(invalidQuery)).toBe(false);
    });
  });

  describe('Backpressure handling', () => {
    it('should handle high-volume streams without memory overflow', async () => {
      // Create a large stream of events
      const largeEventStream: LogEvent[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() + i).toISOString(),
        source: 'mock',
        message: `High volume event ${i}`,
        labels: { service: 'highvolume', batch_id: `batch${Math.floor(i / 100)}` }
      }));

      engine.addAdapter('mock', new MockAdapter(largeEventStream));

      const query = `
        mock({service="highvolume"})[5m]
          or on(batch_id)
          mock({service="highvolume"})[5m]
      `;

      let correlationCount = 0;
      const startMemory = process.memoryUsage().heapUsed;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _correlation of engine.correlate(query)) {
        correlationCount++;
        if (correlationCount > 50) break; // Limit for test
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50);
    }, 30000);
  });
});