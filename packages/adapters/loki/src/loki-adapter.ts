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
  private reconnectAttempts = 0;
  private heartbeatInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private wsConnectionPromise?: Promise<void>;

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

  private async *createWebSocketStream(query: string, timeRange: string): AsyncIterable<LogEvent> {
    const maxReconnectDelay = 30000; // 30 seconds max
    const baseReconnectDelay = 1000; // Start with 1 second
    const shouldReconnect = true;
    
    while (shouldReconnect && this.reconnectAttempts < this.options.maxRetries!) {
      try {
        yield* this.connectAndStream(query, timeRange);
        
        // If we get here, stream ended normally
        this.reconnectAttempts = 0;
        break;
      } catch (error) {
        console.error(`WebSocket stream error (attempt ${this.reconnectAttempts + 1}):`, error);
        
        if (this.reconnectAttempts >= this.options.maxRetries! - 1) {
          throw new CorrelationError(
            'WebSocket connection failed after max retries',
            'WEBSOCKET_MAX_RETRIES',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
        
        // Calculate exponential backoff with jitter
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
          maxReconnectDelay
        );
        
        this.reconnectAttempts++;
        console.log(`Reconnecting in ${delay}ms...`);
        
        await new Promise(resolve => {
          this.reconnectTimeout = setTimeout(resolve, delay);
        });
      }
    }
  }

  private async *connectAndStream(query: string, _timeRange: string): AsyncIterable<LogEvent> {
    const wsUrl = this.options.url.replace(/^http/, 'ws');
    const fullUrl = `${wsUrl}/loki/api/v1/tail?query=${encodeURIComponent(query)}`;

    const ws = new WebSocket(fullUrl, {
      headers: this.buildHeaders(),
      handshakeTimeout: this.options.timeout
    });

    this.ws = ws;
    
    // Set up connection promise
    this.wsConnectionPromise = new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
        this.setupHeartbeat(ws);
      };
      
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      
      const cleanup = () => {
        ws.removeListener('open', onOpen);
        ws.removeListener('error', onError);
      };
      
      ws.once('open', onOpen);
      ws.once('error', onError);
      
      // Add connection timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          cleanup();
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, this.options.timeout!);
    });

    try {
      await this.wsConnectionPromise;
      console.log('WebSocket connected successfully');
      
      const messageQueue: LogEvent[] = [];
      let resolveNext: ((value: IteratorResult<LogEvent>) => void) | null = null;
      let rejectNext: ((error: Error) => void) | null = null;
      let connectionClosed = false;

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          
          // Reset heartbeat on any message
          this.resetHeartbeat(ws);
          
          if (response.streams) {
            for (const stream of response.streams) {
              for (const entry of stream.entries) {
                const event = this.parseLogEntry(stream.stream, entry);
                if (resolveNext) {
                  resolveNext({ value: event, done: false });
                  resolveNext = null;
                  rejectNext = null;
                } else {
                  messageQueue.push(event);
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          if (rejectNext) {
            rejectNext(error as Error);
            resolveNext = null;
            rejectNext = null;
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectionClosed = true;
        if (rejectNext) {
          rejectNext(error);
          resolveNext = null;
          rejectNext = null;
        }
      });
      
      ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: code=${code}, reason=${reason}`);
        connectionClosed = true;
        this.clearHeartbeat();
        
        // Notify waiting promise if any
        if (rejectNext) {
          rejectNext(new Error(`WebSocket closed: ${reason || code}`));
          resolveNext = null;
          rejectNext = null;
        }
      });
      
      ws.on('ping', () => {
        // Respond to ping with pong
        if (ws.readyState === WebSocket.OPEN) {
          ws.pong();
        }
      });

      // Yield events as they arrive
      while (!connectionClosed && ws.readyState === WebSocket.OPEN) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          // Wait for next message
          try {
            yield await new Promise<LogEvent>((resolve, reject) => {
              resolveNext = (result) => {
                if (!result.done) {
                  resolve(result.value);
                }
              };
              rejectNext = reject;
              
              // Check if connection is still alive
              if (connectionClosed || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket connection lost'));
              }
            });
          } catch (error) {
            // Connection lost, will trigger reconnect
            throw error;
          }
        }
      }
    } finally {
      this.clearHeartbeat();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      this.ws = undefined;
      this.wsConnectionPromise = undefined;
    }
  }

  private setupHeartbeat(ws: WebSocket): void {
    this.clearHeartbeat();
    
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        this.clearHeartbeat();
      }
    }, 30000);
  }
  
  private resetHeartbeat(ws: WebSocket): void {
    this.clearHeartbeat();
    this.setupHeartbeat(ws);
  }
  
  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
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
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    
    // Clear heartbeat
    this.clearHeartbeat();
    
    // Close WebSocket if active
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    
    // Wait for WebSocket connection to close if pending
    if (this.wsConnectionPromise) {
      try {
        await Promise.race([
          this.wsConnectionPromise,
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      } catch {
        // Ignore errors during shutdown
      }
      this.wsConnectionPromise = undefined;
    }

    // Cancel all active polling streams
    for (const controller of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0;
  }
}