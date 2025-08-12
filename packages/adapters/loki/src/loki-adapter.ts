import { DataSourceAdapter, LogEvent, CorrelationError } from '@liquescent/log-correlator-core';
import fetch from 'node-fetch';
import WebSocket from 'ws';

export interface LokiAdapterOptions {
  url: string;
  websocket?: boolean;
  pollInterval?: number;
  timeout?: number;
  maxRetries?: number;
  authToken?: string;
  headers?: Record<string, string>;
}

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>; // [timestamp_ns, log_line]
    }>;
  };
}

export class LokiAdapter implements DataSourceAdapter {
  private ws?: WebSocket;
  private activeStreams: Set<AbortController> = new Set();

  constructor(private options: LokiAdapterOptions) {
    this.options = {
      websocket: true,
      pollInterval: 1000,
      timeout: 30000,
      maxRetries: 3,
      ...options
    };
  }

  getName(): string {
    return 'loki';
  }

  async *createStream(query: string, options?: unknown): AsyncIterable<LogEvent> {
    const timeRange = (options as { timeRange?: string })?.timeRange || '5m';
    
    if (this.options.websocket) {
      yield* this.createWebSocketStream(query, timeRange);
    } else {
      yield* this.createPollingStream(query, timeRange);
    }
  }

  private async *createWebSocketStream(query: string, _timeRange: string): AsyncIterable<LogEvent> {
    const wsUrl = this.options.url.replace(/^http/, 'ws');
    const fullUrl = `${wsUrl}/loki/api/v1/tail?query=${encodeURIComponent(query)}`;

    const ws = new WebSocket(fullUrl, {
      headers: this.buildHeaders()
    });

    this.ws = ws;

    try {
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      const messageQueue: LogEvent[] = [];
      let resolveNext: ((value: IteratorResult<LogEvent>) => void) | null = null;

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.streams) {
            for (const stream of response.streams) {
              for (const entry of stream.entries) {
                const event = this.parseLogEntry(stream.stream, entry);
                if (resolveNext) {
                  resolveNext({ value: event, done: false });
                  resolveNext = null;
                } else {
                  messageQueue.push(event);
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Yield events as they arrive
      while (ws.readyState === WebSocket.OPEN) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          // Wait for next message
          yield await new Promise<LogEvent>((resolve) => {
            resolveNext = (result) => {
              if (!result.done) {
                resolve(result.value);
              }
            };
          });
        }
      }
    } finally {
      ws.close();
    }
  }

  private async *createPollingStream(query: string, _timeRange: string): AsyncIterable<LogEvent> {
    const controller = new AbortController();
    this.activeStreams.add(controller);

    try {
      let lastTimestamp = Date.now() * 1000000; // Convert to nanoseconds
      
      while (!controller.signal.aborted) {
        const url = `${this.options.url}/loki/api/v1/query_range`;
        const params = new URLSearchParams({
          query,
          start: (lastTimestamp + 1).toString(),
          end: (Date.now() * 1000000).toString(),
          limit: '1000'
        });

        try {
          const response = await fetch(`${url}?${params}`, {
            method: 'GET',
            headers: this.buildHeaders(),
            signal: controller.signal,
            timeout: this.options.timeout
          } as any);

          if (!response.ok) {
            throw new CorrelationError(
              `Loki query failed: ${response.statusText}`,
              'LOKI_QUERY_ERROR',
              { status: response.status }
            );
          }

          const data = await response.json() as LokiQueryResponse;
          
          if (data.status === 'success' && data.data.result) {
            for (const stream of data.data.result) {
              for (const [timestamp, logLine] of stream.values) {
                const event = this.parseLogEntry(
                  stream.stream,
                  { ts: timestamp, line: logLine }
                );
                yield event;
                
                // Update last timestamp
                const eventTimestamp = parseInt(timestamp, 10);
                if (eventTimestamp > lastTimestamp) {
                  lastTimestamp = eventTimestamp;
                }
              }
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          console.error('Polling error:', error);
        }

        // Wait before next poll
        await new Promise(resolve => 
          setTimeout(resolve, this.options.pollInterval)
        );
      }
    } finally {
      this.activeStreams.delete(controller);
    }
  }

  private parseLogEntry(
    labels: Record<string, string>,
    entry: { ts: string; line: string }
  ): LogEvent {
    // Convert nanosecond timestamp to ISO string
    const timestampMs = parseInt(entry.ts, 10) / 1000000;
    const timestamp = new Date(timestampMs).toISOString();

    // Extract join keys from log line
    const joinKeys = this.extractJoinKeys(entry.line);

    return {
      timestamp,
      source: 'loki',
      stream: labels.job || labels.service || 'unknown',
      message: entry.line,
      labels,
      joinKeys
    };
  }

  private extractJoinKeys(logLine: string): Record<string, string> {
    const keys: Record<string, string> = {};
    
    // Common patterns for extracting IDs
    const patterns = [
      /request[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /trace[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /session[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /correlation[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /span[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i
    ];

    for (const pattern of patterns) {
      const match = logLine.match(pattern);
      if (match) {
        const keyName = pattern.source.split('[')[0].toLowerCase().replace(/[^a-z]/g, '');
        keys[keyName + '_id'] = match[1];
      }
    }

    return keys;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers
    };

    if (this.options.authToken) {
      headers['Authorization'] = this.options.authToken.startsWith('Bearer ')
        ? this.options.authToken
        : `Bearer ${this.options.authToken}`;
    }

    return headers;
  }

  validateQuery(query: string): boolean {
    // Basic validation for Loki LogQL syntax
    try {
      // Check for basic LogQL structure
      if (!query.includes('{') || !query.includes('}')) {
        return false;
      }
      
      // Check for valid label matchers
      const labelPattern = /\{([^}]+)\}/;
      const match = query.match(labelPattern);
      if (!match) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async getAvailableStreams(): Promise<string[]> {
    const url = `${this.options.url}/loki/api/v1/labels`;
    
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
        timeout: this.options.timeout
      } as any);

      if (!response.ok) {
        throw new CorrelationError(
          'Failed to fetch available streams',
          'LOKI_LABELS_ERROR'
        );
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to get available streams:', error);
      return [];
    }
  }

  async destroy(): Promise<void> {
    // Close WebSocket if active
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // Cancel all active polling streams
    for (const controller of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
  }
}