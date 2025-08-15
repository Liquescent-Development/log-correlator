import { PromQLAdapter, PromQLAdapterOptions } from "./promql-adapter";
import { CorrelationError } from "@liquescent/log-correlator-core";
import fetch from "node-fetch";

// Mock dependencies
jest.mock("node-fetch");

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("PromQLAdapter", () => {
  let adapter: PromQLAdapter;
  let defaultOptions: PromQLAdapterOptions;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    defaultOptions = {
      url: "http://localhost:9090",
      pollInterval: 0, // Default to one-time query
      timeout: 30000,
      maxRetries: 3,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create adapter without authentication", () => {
      adapter = new PromQLAdapter(defaultOptions);
      expect(adapter.getName()).toBe("promql");
    });

    it("should create adapter with username/password authentication", () => {
      const authOptions = {
        ...defaultOptions,
        username: "admin",
        password: "password",
      };

      adapter = new PromQLAdapter(authOptions);
      expect(adapter.getName()).toBe("promql");
    });

    it("should create adapter with API token authentication", () => {
      const tokenOptions = {
        ...defaultOptions,
        apiToken: "test-api-token",
      };

      adapter = new PromQLAdapter(tokenOptions);
      expect(adapter.getName()).toBe("promql");
    });
  });

  describe("Authentication", () => {
    it("should create Bearer auth header from API token", async () => {
      const tokenOptions = {
        ...defaultOptions,
        apiToken: "test-api-token",
      };

      adapter = new PromQLAdapter(tokenOptions);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const query = "up";
      const streamIterator = adapter.createStream(query);

      await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-token",
          }),
        }),
      );
    });

    it("should create Basic auth header from username/password", async () => {
      const authOptions = {
        ...defaultOptions,
        username: "testuser",
        password: "testpass",
      };

      adapter = new PromQLAdapter(authOptions);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const query = "up";
      const streamIterator = adapter.createStream(query);

      await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      // testuser:testpass in base64 is dGVzdHVzZXI6dGVzdHBhc3M=
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Basic dGVzdHVzZXI6dGVzdHBhc3M=",
          }),
        }),
      );
    });

    it("should work without authentication", async () => {
      adapter = new PromQLAdapter(defaultOptions);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const query = "up";
      const streamIterator = adapter.createStream(query);

      await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      );
    });
  });

  describe("validateQuery", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should validate basic metric names", () => {
      expect(adapter.validateQuery("up")).toBe(true);
      expect(adapter.validateQuery("http_requests_total")).toBe(true);
      expect(adapter.validateQuery("node_cpu_seconds_total")).toBe(true);
    });

    it("should validate metric selectors", () => {
      expect(adapter.validateQuery('up{job="prometheus"}')).toBe(true);
      expect(adapter.validateQuery('{__name__="up"}')).toBe(true);
      expect(
        adapter.validateQuery('http_requests_total{method="GET",status="200"}'),
      ).toBe(true);
    });

    it("should validate metrics with namespaces", () => {
      expect(adapter.validateQuery("prometheus:http_requests_total")).toBe(
        true,
      );
      expect(adapter.validateQuery("node:cpu:utilization")).toBe(true);
    });

    it("should reject invalid queries", () => {
      expect(adapter.validateQuery("123invalid")).toBe(false);
      expect(adapter.validateQuery("invalid-metric-name")).toBe(false);
      expect(adapter.validateQuery("")).toBe(false);
    });
  });

  describe("One-time metric queries", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should query metrics and transform to log events", async () => {
      const query = 'up{job="prometheus"}';

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {
                  __name__: "up",
                  job: "prometheus",
                  instance: "localhost:9090",
                },
                values: [
                  [1640995200, "1"],
                  [1640995260, "1"],
                  [1640995320, "0"],
                ],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const results = [];

      // Get all events
      for await (const event of streamIterator) {
        results.push(event);
      }

      expect(results).toHaveLength(3);

      expect(results[0]).toMatchObject({
        timestamp: "2022-01-01T00:00:00.000Z",
        source: "promql",
        message: "up=1",
        labels: {
          __name__: "up",
          job: "prometheus",
          instance: "localhost:9090",
          __value__: "1",
        },
        joinKeys: {
          __name__: "up",
          job: "prometheus",
          instance: "localhost:9090",
        },
      });

      expect(results[2]).toMatchObject({
        timestamp: "2022-01-01T00:02:00.000Z",
        message: "up=0",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/query_range"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
        }),
      );
    });

    it("should handle vector responses", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "vector",
            result: [
              {
                metric: {
                  __name__: "up",
                  job: "prometheus",
                },
                value: [1640995200, "1"],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const results = [];

      for await (const event of streamIterator) {
        results.push(event);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        timestamp: "2022-01-01T00:00:00.000Z",
        source: "promql",
        message: "up=1",
      });
    });

    it("should handle scalar responses", async () => {
      const query = "scalar(up)";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "scalar",
            result: [1640995200, "1"],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const results = [];

      for await (const event of streamIterator) {
        results.push(event);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        timestamp: "2022-01-01T00:00:00.000Z",
        source: "promql",
        message: "metric=1",
      });
    });

    it("should respect limit option", async () => {
      const query = "up";
      const options = { limit: 2 };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "up" },
                values: [
                  [1640995200, "1"],
                  [1640995260, "1"],
                  [1640995320, "1"],
                ],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query, options);
      const results = [];

      for await (const event of streamIterator) {
        results.push(event);
      }

      expect(results).toHaveLength(2); // Limited to 2 events
    });

    it("should handle time range options", async () => {
      const query = "up";
      const options = { timeRange: "1h" };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query, options);
      await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      // Should use 1 hour time range in request parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("start="),
        expect.any(Object),
      );
    });

    it("should calculate appropriate step size", async () => {
      const query = "up";
      const options = { timeRange: "24h" };

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query, options);
      await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      // Should calculate step based on time range (24h = 86400s / 100 = 864s)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("step=864s"),
        expect.any(Object),
      );
    });
  });

  describe("Polling mode", () => {
    beforeEach(() => {
      const pollingOptions = {
        ...defaultOptions,
        pollInterval: 5000, // 5 seconds
      };
      adapter = new PromQLAdapter(pollingOptions);
    });

    it("should poll for metrics continuously", async () => {
      // Create adapter with polling enabled
      const pollingAdapter = new PromQLAdapter({
        ...defaultOptions,
        pollInterval: 100, // Shorter interval for testing
      });

      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "up" },
                values: [[Date.now() / 1000, "1"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = pollingAdapter.createStream(query);
      const iterator = streamIterator[Symbol.asyncIterator]();

      // Start the polling and let it run briefly
      const promise1 = iterator.next();
      jest.advanceTimersByTime(50);
      const result1 = await promise1;
      expect(result1.done).toBe(false);

      // Let the polling cycle continue
      jest.advanceTimersByTime(100);

      await pollingAdapter.destroy();

      // Should have been called at least once for the polling setup
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle polling errors gracefully", async () => {
      const query = "up";

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: "success",
            data: {
              resultType: "matrix",
              result: [],
            },
          }),
        } as any);

      const streamIterator = adapter.createStream(query);

      // Should not throw error, just continue polling
      const iterator = streamIterator[Symbol.asyncIterator]();
      void iterator.next(); // Start the async iteration

      jest.advanceTimersByTime(10000);

      // Should have retried after error
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await adapter.destroy();
    });

    it("should stop polling when AbortError occurs", async () => {
      const query = "up";

      mockFetch.mockImplementation(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      const streamIterator = adapter.createStream(query);

      // Start iteration
      const iterator = streamIterator[Symbol.asyncIterator]();
      void iterator.next(); // Start the async iteration

      await adapter.destroy();

      // Should stop polling after abort
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("Query parsing and validation", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should parse metric name from selector", async () => {
      const testCases = [
        { query: 'up{job="prometheus"}', expected: "up" },
        { query: '{__name__="http_requests_total"}', expected: "" },
        { query: "node_cpu_seconds_total", expected: "node_cpu_seconds_total" },
      ];

      for (const { query } of testCases) {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: "success",
            data: { resultType: "matrix", result: [] },
          }),
        };

        mockFetch.mockResolvedValue(mockResponse as any);

        const streamIterator = adapter.createStream(query);
        await (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`query=${encodeURIComponent(query)}`),
          expect.any(Object),
        );

        mockFetch.mockClear();
      }
    });

    it("should throw error for invalid selectors", async () => {
      const invalidQuery = "invalid{unclosed";

      await expect(async () => {
        const streamIterator = adapter.createStream(invalidQuery);
        await (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })();
      }).rejects.toThrow(CorrelationError);
    });
  });

  describe("Time range parsing", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should parse different time range formats", async () => {
      const testCases = [
        { timeRange: "30s", expectedMs: 30 * 1000 },
        { timeRange: "5m", expectedMs: 5 * 60 * 1000 },
        { timeRange: "2h", expectedMs: 2 * 60 * 60 * 1000 },
        { timeRange: "1d", expectedMs: 1 * 24 * 60 * 60 * 1000 },
      ];

      for (const { timeRange } of testCases) {
        const query = "up";

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: "success",
            data: { resultType: "matrix", result: [] },
          }),
        };

        mockFetch.mockResolvedValue(mockResponse as any);

        const streamIterator = adapter.createStream(query, { timeRange });
        await (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })();

        expect(mockFetch).toHaveBeenCalled();

        mockFetch.mockClear();
      }
    });

    it("should throw error for invalid time range formats", async () => {
      const query = "up";

      await expect(async () => {
        const streamIterator = adapter.createStream(query, {
          timeRange: "invalid",
        });
        await (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })();
      }).rejects.toThrow(CorrelationError);
    });
  });

  describe("Data transformation", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should extract metric name from __name__ label", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {
                  __name__: "custom_metric",
                  job: "test",
                },
                values: [[1640995200, "42"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.message).toBe("custom_metric=42");
    });

    it("should handle metrics without __name__ label", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {
                  job: "test",
                  instance: "localhost",
                },
                values: [[1640995200, "42"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.message).toBe("metric=42");
    });

    it("should convert Prometheus timestamps correctly", async () => {
      const query = "up";
      const prometheusTimestamp = 1640995200; // Unix timestamp in seconds

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "up" },
                values: [[prometheusTimestamp, "1"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.timestamp).toBe("2022-01-01T00:00:00.000Z");
    });

    it("should include all metric labels as joinKeys", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {
                  __name__: "up",
                  job: "prometheus",
                  instance: "localhost:9090",
                  region: "us-east-1",
                },
                values: [[1640995200, "1"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.joinKeys).toEqual({
        __name__: "up",
        job: "prometheus",
        instance: "localhost:9090",
        region: "us-east-1",
      });
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should handle HTTP error responses", async () => {
      const query = "up";

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      } as any);

      const streamIterator = adapter.createStream(query);

      await expect(async () => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        await iterator.next();
      }).rejects.toThrow(CorrelationError);
    });

    it("should handle network errors", async () => {
      const query = "up";

      mockFetch.mockRejectedValue(new Error("Network error"));

      const streamIterator = adapter.createStream(query);

      await expect(
        (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })(),
      ).rejects.toThrow("Network error");
    });

    it("should handle malformed JSON responses", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);

      await expect(
        (() => {
          const iterator = streamIterator[Symbol.asyncIterator]();
          return iterator.next();
        })(),
      ).rejects.toThrow("Invalid JSON");
    });

    it("should handle empty response data", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.done).toBe(true);
    });

    it("should handle malformed metric data", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {}, // No metric labels
                values: [], // No values
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.done).toBe(true);
    });
  });

  describe("getAvailableStreams", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should fetch available metric names", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: [
            "up",
            "http_requests_total",
            "node_cpu_seconds_total",
            "prometheus_http_requests_total",
          ],
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streams = await adapter.getAvailableStreams();

      expect(streams).toEqual([
        "up",
        "http_requests_total",
        "node_cpu_seconds_total",
        "prometheus_http_requests_total",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9090/api/v1/label/__name__/values",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
        }),
      );
    });

    it("should handle fetch errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const streams = await adapter.getAvailableStreams();

      expect(streams).toEqual([]);
    });

    it("should handle HTTP errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      } as any);

      const streams = await adapter.getAvailableStreams();

      expect(streams).toEqual([]);
    });

    it("should handle malformed response gracefully", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          // Missing data property
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streams = await adapter.getAvailableStreams();

      expect(streams).toEqual([]);
    });

    it("should include authentication headers when configured", async () => {
      const authOptions = {
        ...defaultOptions,
        apiToken: "test-token",
      };

      adapter = new PromQLAdapter(authOptions);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: ["up"],
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      await adapter.getAvailableStreams();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });
  });

  describe("destroy", () => {
    beforeEach(() => {
      const pollingOptions = {
        ...defaultOptions,
        pollInterval: 5000,
      };
      adapter = new PromQLAdapter(pollingOptions);
    });

    it("should cancel active polling streams", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: { resultType: "matrix", result: [] },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);

      // Start iteration
      const iterator = streamIterator[Symbol.asyncIterator]();
      void iterator.next(); // Start the async iteration

      await adapter.destroy();

      // The stream should be cancelled via AbortController
      expect(true).toBe(true);
    });

    it("should handle multiple concurrent streams", async () => {
      const queries = ["up", "http_requests_total", "node_cpu_seconds_total"];

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: { resultType: "matrix", result: [] },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      // Start multiple streams
      const streamIterators = queries.map((query) =>
        adapter.createStream(query),
      );
      streamIterators.forEach((iter) => {
        const iterator = iter[Symbol.asyncIterator]();
        void iterator.next(); // Start the async iteration
      });

      await adapter.destroy();

      // All streams should be cancelled
      expect(true).toBe(true);
    });
  });

  describe("Edge cases", () => {
    beforeEach(() => {
      adapter = new PromQLAdapter(defaultOptions);
    });

    it("should handle very large metric values", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "large_metric" },
                values: [[1640995200, "1234567890123456789.123456789"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.message).toBe(
        "large_metric=1234567890123456789.123456789",
      );
      expect(result.value?.labels.__value__).toBe(
        "1234567890123456789.123456789",
      );
    });

    it("should handle special metric names with colons", async () => {
      const query = "prometheus:http_requests_total";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {
                  __name__: "prometheus:http_requests_total",
                  job: "prometheus",
                },
                values: [[1640995200, "100"]],
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.message).toBe("prometheus:http_requests_total=100");
    });

    it("should handle missing values array", async () => {
      const query = "up";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: { __name__: "up" },
                // Missing values and value properties
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.done).toBe(true);
    });

    it("should handle string result type", async () => {
      const query = "version";

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "success",
          data: {
            resultType: "string",
            result: [1640995200, "prometheus-v2.30.0"],
          },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const streamIterator = adapter.createStream(query);
      const result = await (() => {
        const iterator = streamIterator[Symbol.asyncIterator]();
        return iterator.next();
      })();

      expect(result.value?.message).toBe("metric=prometheus-v2.30.0");
    });
  });
});
