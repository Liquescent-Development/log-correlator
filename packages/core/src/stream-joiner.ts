import { LogEvent, CorrelatedEvent, JoinType } from './types';
import { TimeWindow } from './time-window';
import { parseTimeWindow } from './utils';

export interface StreamJoinerOptions {
  joinType: JoinType;
  joinKeys: string[];
  timeWindow: number;
  lateTolerance: number;
  maxEvents: number;
  temporal?: string;
  labelMappings?: Array<{ left: string; right: string }>;
  filter?: string;
}

export class StreamJoiner {
  private windows: TimeWindow[] = [];
  private correlationCounter = 0;

  constructor(private options: StreamJoinerOptions) {}

  async *join(
    leftStream: AsyncIterable<LogEvent>,
    rightStream: AsyncIterable<LogEvent>
  ): AsyncGenerator<CorrelatedEvent> {
    const currentWindow = this.createNewWindow();
    const leftEvents: Map<string, LogEvent[]> = new Map();
    const rightEvents: Map<string, LogEvent[]> = new Map();

    // Process streams concurrently
    const leftPromise = this.processStream(leftStream, leftEvents, 'left');
    const rightPromise = this.processStream(rightStream, rightEvents, 'right');

    // Start correlation checking
    const correlationInterval = setInterval(() => {
      const correlations = this.findCorrelations(leftEvents, rightEvents);
      for (const correlation of correlations) {
        // Yield is not directly possible in setInterval, store for later
      }
    }, 100);

    try {
      // Wait for both streams to complete
      await Promise.all([leftPromise, rightPromise]);
      
      // Final correlation check
      const correlations = this.findCorrelations(leftEvents, rightEvents);
      for (const correlation of correlations) {
        yield correlation;
      }
    } finally {
      clearInterval(correlationInterval);
      currentWindow.clear();
    }
  }

  private createNewWindow(): TimeWindow {
    const window = new TimeWindow({
      windowSize: this.options.timeWindow,
      lateTolerance: this.options.lateTolerance,
      maxEvents: this.options.maxEvents
    });
    this.windows.push(window);
    return window;
  }

  private async processStream(
    stream: AsyncIterable<LogEvent>,
    storage: Map<string, LogEvent[]>,
    streamName: string
  ): Promise<void> {
    for await (const event of stream) {
      // Extract join key value
      const joinKeyValue = this.extractJoinKey(event);
      if (!joinKeyValue) continue;

      // Store event
      if (!storage.has(joinKeyValue)) {
        storage.set(joinKeyValue, []);
      }
      storage.get(joinKeyValue)!.push(event);
    }
  }

  private extractJoinKey(event: LogEvent): string | null {
    // Check for label mappings first
    if (this.options.labelMappings) {
      for (const mapping of this.options.labelMappings) {
        const leftValue = event.labels[mapping.left] || event.joinKeys?.[mapping.left];
        const rightValue = event.labels[mapping.right] || event.joinKeys?.[mapping.right];
        if (leftValue) return leftValue;
        if (rightValue) return rightValue;
      }
    }
    
    // Standard join key extraction
    for (const key of this.options.joinKeys) {
      if (event.labels[key]) {
        return event.labels[key];
      }
      if (event.joinKeys && event.joinKeys[key]) {
        return event.joinKeys[key];
      }
    }
    return null;
  }

  private findCorrelations(
    leftEvents: Map<string, LogEvent[]>,
    rightEvents: Map<string, LogEvent[]>
  ): CorrelatedEvent[] {
    const correlations: CorrelatedEvent[] = [];
    const processedKeys = new Set<string>();

    // Process based on join type
    if (this.options.joinType === 'and') {
      // Inner join - only keys present in both
      for (const [key, leftEventList] of leftEvents) {
        if (rightEvents.has(key) && !processedKeys.has(key)) {
          const rightEventList = rightEvents.get(key)!;
          correlations.push(this.createCorrelation(
            key,
            [...leftEventList, ...rightEventList],
            'complete'
          ));
          processedKeys.add(key);
        }
      }
    } else if (this.options.joinType === 'or') {
      // Left join - all from left, matched from right if available
      for (const [key, leftEventList] of leftEvents) {
        if (!processedKeys.has(key)) {
          const rightEventList = rightEvents.get(key) || [];
          correlations.push(this.createCorrelation(
            key,
            [...leftEventList, ...rightEventList],
            rightEventList.length > 0 ? 'complete' : 'partial'
          ));
          processedKeys.add(key);
        }
      }
    } else if (this.options.joinType === 'unless') {
      // Anti-join - only keys NOT in right
      for (const [key, leftEventList] of leftEvents) {
        if (!rightEvents.has(key) && !processedKeys.has(key)) {
          correlations.push(this.createCorrelation(
            key,
            leftEventList,
            'partial'
          ));
          processedKeys.add(key);
        }
      }
    }

    return correlations;
  }

  private createCorrelation(
    joinValue: string,
    events: LogEvent[],
    completeness: 'complete' | 'partial'
  ): CorrelatedEvent {
    // Sort events by timestamp
    events.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const streams = new Set(events.map(e => e.source));
    const earliestTime = events[0].timestamp;
    const latestTime = events[events.length - 1].timestamp;

    return {
      correlationId: `corr_${++this.correlationCounter}`,
      timestamp: earliestTime,
      timeWindow: {
        start: earliestTime,
        end: latestTime
      },
      joinKey: this.options.joinKeys[0],
      joinValue,
      events: events.map(e => ({
        alias: e.stream,
        source: e.source,
        timestamp: e.timestamp,
        message: e.message,
        labels: e.labels
      })),
      metadata: {
        completeness,
        matchedStreams: Array.from(streams),
        totalStreams: 2 // For now, we support 2 streams
      }
    };
  }

  cleanup(): void {
    for (const window of this.windows) {
      window.clear();
    }
    this.windows = [];
  }
}