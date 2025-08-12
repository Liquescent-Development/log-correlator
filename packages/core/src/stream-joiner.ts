import { LogEvent, CorrelatedEvent, JoinType } from './types';
import { TimeWindow } from './time-window';

export interface StreamJoinerOptions {
  joinType: JoinType;
  joinKeys: string[];
  timeWindow: number;
  lateTolerance: number;
  maxEvents: number;
  temporal?: number;
  ignoring?: string[];
  grouping?: {
    side: 'left' | 'right';
    labels: string[];
  };
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
      // TODO: Process correlations in real-time
      // this.findCorrelations(leftEvents, rightEvents);
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
    _streamName: string
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

  private filterByTemporal(
    leftEvents: LogEvent[],
    rightEvents: LogEvent[],
    temporalMs: number
  ): LogEvent[] {
    const allEvents: LogEvent[] = [];
    
    // For each left event, check if there's a right event within temporal window
    for (const leftEvent of leftEvents) {
      const leftTime = new Date(leftEvent.timestamp).getTime();
      
      for (const rightEvent of rightEvents) {
        const rightTime = new Date(rightEvent.timestamp).getTime();
        const timeDiff = Math.abs(rightTime - leftTime);
        
        if (timeDiff <= temporalMs) {
          // Events are within temporal window, include both
          if (!allEvents.includes(leftEvent)) {
            allEvents.push(leftEvent);
          }
          if (!allEvents.includes(rightEvent)) {
            allEvents.push(rightEvent);
          }
        }
      }
    }
    
    return allEvents;
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
    
    // If ignoring is specified, create a composite key from all labels except ignored ones
    if (this.options.ignoring && this.options.ignoring.length > 0) {
      const keyParts: string[] = [];
      const allLabels = { ...event.labels, ...event.joinKeys };
      
      for (const [label, value] of Object.entries(allLabels)) {
        if (!this.options.ignoring.includes(label) && value) {
          keyParts.push(`${label}:${value}`);
        }
      }
      
      return keyParts.length > 0 ? keyParts.sort().join(',') : null;
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
          
          // Handle grouping modifiers for many-to-one or one-to-many joins
          if (this.options.grouping) {
            if (this.options.grouping.side === 'left') {
              // group_left: Keep all left events, allow multiple right matches
              // Create one correlation per left event with all matching right events
              for (const leftEvent of leftEventList) {
                const correlation = this.createCorrelation(
                  key,
                  [leftEvent, ...rightEventList],
                  'complete'
                );
                if (correlation) {
                  correlations.push(correlation);
                }
              }
            } else {
              // group_right: Keep all right events, allow multiple left matches
              // Create one correlation per right event with all matching left events
              for (const rightEvent of rightEventList) {
                const correlation = this.createCorrelation(
                  key,
                  [...leftEventList, rightEvent],
                  'complete'
                );
                if (correlation) {
                  correlations.push(correlation);
                }
              }
            }
          } else {
            // Standard join without grouping
            // Apply temporal constraint if specified
            if (this.options.temporal !== undefined) {
              // Check if events are within temporal window
              const filteredEvents = this.filterByTemporal(
                leftEventList, 
                rightEventList, 
                this.options.temporal
              );
              
              if (filteredEvents.length === 0) {
                continue; // Skip this correlation if no events match temporal constraint
              }
              
              const correlation = this.createCorrelation(
                key,
                filteredEvents,
                'complete'
              );
              if (correlation) {
                correlations.push(correlation);
              }
            } else {
              const correlation = this.createCorrelation(
                key,
                [...leftEventList, ...rightEventList],
                'complete'
              );
              if (correlation) {
                correlations.push(correlation);
              }
            }
          }
          processedKeys.add(key);
        }
      }
    } else if (this.options.joinType === 'or') {
      // Left join - all from left, matched from right if available
      for (const [key, leftEventList] of leftEvents) {
        if (!processedKeys.has(key)) {
          const rightEventList = rightEvents.get(key) || [];
          const correlation = this.createCorrelation(
            key,
            [...leftEventList, ...rightEventList],
            rightEventList.length > 0 ? 'complete' : 'partial'
          );
          if (correlation) {
            correlations.push(correlation);
          }
          processedKeys.add(key);
        }
      }
    } else if (this.options.joinType === 'unless') {
      // Anti-join - only keys NOT in right
      for (const [key, leftEventList] of leftEvents) {
        if (!rightEvents.has(key) && !processedKeys.has(key)) {
          const correlation = this.createCorrelation(
            key,
            leftEventList,
            'partial'
          );
          if (correlation) {
            correlations.push(correlation);
          }
          processedKeys.add(key);
        }
      }
    }

    return correlations;
  }

  private applyFilter(events: LogEvent[]): LogEvent[] {
    if (!this.options.filter) {
      return events;
    }

    // Parse filter expression like {status=~"4..|5.."}
    const filterMatch = this.options.filter.match(/\{([^}]+)\}/);
    if (!filterMatch) {
      return events;
    }

    const filterExpr = filterMatch[1];
    const matchers = this.parseMatchers(filterExpr);
    
    return events.filter(event => {
      for (const matcher of matchers) {
        const value = event.labels[matcher.label];
        if (!this.matchValue(value, matcher.operator, matcher.value)) {
          return false;
        }
      }
      return true;
    });
  }

  private parseMatchers(expr: string): Array<{label: string, operator: string, value: string}> {
    const matchers: Array<{label: string, operator: string, value: string}> = [];
    // Split by comma, but not within quotes
    const parts = expr.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    
    for (const part of parts) {
      const match = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"([^"]+)"$/);
      if (match) {
        matchers.push({
          label: match[1],
          operator: match[2],
          value: match[3]
        });
      }
    }
    
    return matchers;
  }

  private matchValue(actual: string | undefined, operator: string, expected: string): boolean {
    if (!actual) {
      return operator === '!=' || operator === '!~';
    }

    switch (operator) {
      case '=':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '=~':
        try {
          const regex = new RegExp(expected);
          return regex.test(actual);
        } catch {
          return false;
        }
      case '!~':
        try {
          const regex = new RegExp(expected);
          return !regex.test(actual);
        } catch {
          return true;
        }
      default:
        return false;
    }
  }

  private createCorrelation(
    joinValue: string,
    events: LogEvent[],
    completeness: 'complete' | 'partial'
  ): CorrelatedEvent {
    // Apply filter if specified
    const filteredEvents = this.applyFilter(events);
    
    if (filteredEvents.length === 0) {
      // If filter removes all events, return null (handled by caller)
      return null as any;
    }
    
    // Sort events by timestamp
    filteredEvents.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const streams = new Set(filteredEvents.map(e => e.source));
    const earliestTime = filteredEvents[0].timestamp;
    const latestTime = filteredEvents[filteredEvents.length - 1].timestamp;

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