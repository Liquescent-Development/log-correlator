import {
  DataSourceAdapter,
  LogEvent,
  CorrelationError,
} from "@liquescent/log-correlator-core";
import fetch, { RequestInit } from "node-fetch";

export interface GraylogAdapterOptions {
  url: string;
  username?: string;
  password?: string;
  apiToken?: string;
  pollInterval?: number;
  timeout?: number;
  maxRetries?: number;
  streamId?: string;
}

interface GraylogMessage {
  message: string;
  timestamp: string;
  source: string;
  fields: Record<string, unknown>;
  _id: string;
}

interface GraylogSearchResponse {
  messages: Array<{
    message: GraylogMessage;
    index: string;
  }>;
  total_results: number;
  from: string;
  to: string;
}

export class GraylogAdapter implements DataSourceAdapter {
  private activeStreams: Set<AbortController> = new Set();
  private authHeader: string;

  constructor(private options: GraylogAdapterOptions) {
    this.options = {
      pollInterval: 2000,
      timeout: 15000,
      maxRetries: 3,
      ...options,
    };

    // Setup authentication
    if (options.apiToken) {
      this.authHeader = `token ${options.apiToken}`;
    } else if (options.username && options.password) {
      const credentials = Buffer.from(
        `${options.username}:${options.password}`,
      ).toString("base64");
      this.authHeader = `Basic ${credentials}`;
    } else {
      throw new CorrelationError(
        "Graylog adapter requires either apiToken or username/password",
        "AUTH_REQUIRED",
      );
    }
  }

  getName(): string {
    return "graylog";
  }

  async *createStream(
    query: string,
    options?: unknown,
  ): AsyncIterable<LogEvent> {
    const timeRange = (options as { timeRange?: string })?.timeRange || "5m";
    yield* this.createPollingStream(query, timeRange);
  }

  private async *createPollingStream(
    query: string,
    timeRange: string,
  ): AsyncIterable<LogEvent> {
    const controller = new AbortController();
    this.activeStreams.add(controller);

    try {
      let lastMessageId: string | null = null;
      const timeWindowMs = this.parseTimeRange(timeRange);

      while (!controller.signal.aborted) {
        const now = new Date();
        const from = new Date(now.getTime() - timeWindowMs);

        const searchParams: Record<string, unknown> = {
          query: this.convertToGraylogQuery(query),
          from: from.toISOString(),
          to: now.toISOString(),
          limit: 1000,
          sort: "timestamp:asc",
          fields: "_id,message,timestamp,source,*",
        };

        if (this.options.streamId) {
          searchParams["filter"] = `streams:${this.options.streamId}`;
        }

        try {
          const response = await this.search(searchParams, controller.signal);

          if (response.messages && response.messages.length > 0) {
            let newMessages = response.messages;

            // Filter out messages we've already seen
            if (lastMessageId) {
              const lastIndex = newMessages.findIndex(
                (m) => m.message._id === lastMessageId,
              );
              if (lastIndex >= 0) {
                newMessages = newMessages.slice(lastIndex + 1);
              }
            }

            for (const msg of newMessages) {
              yield this.parseGraylogMessage(msg.message);
              lastMessageId = msg.message._id;
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          console.error("Graylog polling error:", error);

          // Retry with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, this.options.pollInterval! * 2),
          );
        }

        // Wait before next poll
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.pollInterval),
        );
      }
    } finally {
      this.activeStreams.delete(controller);
    }
  }

  private async search(
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<GraylogSearchResponse> {
    const url = `${this.options.url}/api/search/universal/relative`;
    const queryParams = new URLSearchParams(params as Record<string, string>);

    const fetchOptions: RequestInit = {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "X-Requested-By": "log-correlator",
      },
      signal,
    };

    const response = await fetch(`${url}?${queryParams}`, fetchOptions);

    if (!response.ok) {
      throw new CorrelationError(
        `Graylog search failed: ${response.statusText}`,
        "GRAYLOG_SEARCH_ERROR",
        { status: response.status },
      );
    }

    return await response.json();
  }

  private parseGraylogMessage(message: GraylogMessage): LogEvent {
    // Extract labels from fields
    const labels: Record<string, string> = {};
    const joinKeys: Record<string, string> = {};

    if (message.fields) {
      for (const [key, value] of Object.entries(message.fields)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          labels[key] = String(value);

          // Check if this field could be a join key
          if (
            key.endsWith("_id") ||
            key.includes("correlation") ||
            key.includes("trace")
          ) {
            joinKeys[key] = String(value);
          }
        }
      }
    }

    // Also extract join keys from message content if available
    if (message.message) {
      const extractedKeys = this.extractJoinKeys(message.message);
      Object.assign(joinKeys, extractedKeys);
    }

    return {
      timestamp: message.timestamp || new Date().toISOString(),
      source: "graylog",
      stream: message.source || "unknown",
      message: message.message || "",
      labels,
      joinKeys,
    };
  }

  private extractJoinKeys(message: string): Record<string, string> {
    const keys: Record<string, string> = {};

    // Common patterns for extracting IDs
    const patterns = [
      /request[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /trace[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /session[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
      /correlation[_-]?id[=:\s]+["']?([a-zA-Z0-9-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const keyName = pattern.source
          .split("[")[0]
          .toLowerCase()
          .replace(/[^a-z]/g, "");
        keys[keyName + "_id"] = match[1];
      }
    }

    return keys;
  }

  private convertToGraylogQuery(query: string): string {
    // Convert from simplified syntax to Graylog query
    // Example: service:backend -> service:backend
    // Example: service="backend" -> service:backend

    // Parse without regex to avoid ReDoS vulnerabilities
    let result = "";
    let i = 0;

    while (i < query.length) {
      // Look for field="value" or field='value' patterns
      const fieldStart = i;
      // Check for word characters without regex
      while (
        i < query.length &&
        ((query[i] >= "a" && query[i] <= "z") ||
          (query[i] >= "A" && query[i] <= "Z") ||
          (query[i] >= "0" && query[i] <= "9") ||
          query[i] === "_")
      ) {
        i++;
      }

      if (i > fieldStart && i < query.length && query[i] === "=") {
        const field = query.substring(fieldStart, i);
        i++; // skip '='

        if (i < query.length && (query[i] === '"' || query[i] === "'")) {
          const quote = query[i];
          i++; // skip opening quote
          const valueStart = i;

          // Find closing quote
          while (i < query.length && query[i] !== quote) {
            i++;
          }

          if (i < query.length) {
            const value = query.substring(valueStart, i);
            result += field + ":" + value;
            i++; // skip closing quote
          } else {
            // No closing quote, treat as literal
            result += query.substring(fieldStart);
            break;
          }
        } else {
          // No quotes after =, revert to original
          result += query.substring(fieldStart, i);
        }
      } else {
        // Not a field=value pattern, copy as-is
        if (fieldStart < i) {
          result += query.substring(fieldStart, i);
        }
        if (i < query.length) {
          result += query[i];
          i++;
        }
      }
    }

    // Handle AND/OR operators
    const words: string[] = [];
    let currentWord = "";

    for (let j = 0; j < result.length; j++) {
      if (
        result[j] === " " ||
        result[j] === "\t" ||
        result[j] === "\n" ||
        result[j] === "\r"
      ) {
        if (currentWord) {
          const upperWord = currentWord.toUpperCase();
          words.push(
            upperWord === "AND" || upperWord === "OR" ? upperWord : currentWord,
          );
          currentWord = "";
        }
      } else {
        currentWord += result[j];
      }
    }
    if (currentWord) {
      const upperWord = currentWord.toUpperCase();
      words.push(
        upperWord === "AND" || upperWord === "OR" ? upperWord : currentWord,
      );
    }

    result = words.join(" ");

    return result;
  }

  private parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 5 minutes
      return 5 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 5 * 60 * 1000;
    }
  }

  validateQuery(query: string): boolean {
    // Basic validation for Graylog query syntax
    try {
      // Limit query length to prevent DoS
      if (!query || query.length > 10000) {
        return false;
      }

      // Check for basic field:value syntax
      if (query.includes(":") || query.includes("=")) {
        return true;
      }

      // Allow simple text searches
      if (query.length > 0) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async getAvailableStreams(): Promise<string[]> {
    const url = `${this.options.url}/api/streams`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "X-Requested-By": "log-correlator",
        },
      });

      if (!response.ok) {
        throw new CorrelationError(
          "Failed to fetch available streams",
          "GRAYLOG_STREAMS_ERROR",
        );
      }

      const data = await response.json();
      return data.streams?.map((s: { title: string }) => s.title) || [];
    } catch (error) {
      console.error("Failed to get available streams:", error);
      return [];
    }
  }

  async destroy(): Promise<void> {
    // Cancel all active polling streams
    for (const controller of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
  }
}
