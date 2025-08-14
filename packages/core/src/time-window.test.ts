import { TimeWindow } from "./time-window";
import { LogEvent } from "./types";

describe("TimeWindow", () => {
  const createTestEvent = (timestamp: string, message = "test"): LogEvent => ({
    timestamp,
    source: "test",
    message,
    labels: { service: "test" },
    joinKeys: { request_id: "test123" },
  });

  describe("constructor", () => {
    it("should initialize with correct window boundaries", () => {
      const now = Date.now();
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      const timeRange = window.getTimeRange();
      const startTime = new Date(timeRange.start).getTime();
      const endTime = new Date(timeRange.end).getTime();

      expect(endTime - startTime).toBe(30000);
      expect(startTime).toBeGreaterThanOrEqual(now - 1000);
      expect(startTime).toBeLessThanOrEqual(now + 1000);
    });
  });

  describe("addEvent", () => {
    it("should accept events within the window", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      const now = new Date().toISOString();
      const event = createTestEvent(now);

      const added = window.addEvent(event, "key1");
      expect(added).toBe(true);
      expect(window.getEventCount()).toBe(1);
    });

    it("should reject events that are too old", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      const oldTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const event = createTestEvent(oldTime);

      const added = window.addEvent(event, "key1");
      expect(added).toBe(false);
      expect(window.getEventCount()).toBe(0);
    });

    it("should accept late events within tolerance", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      // Simulate window that started 31 seconds ago
      const timeRange = window.getTimeRange();
      const windowStart = new Date(timeRange.start).getTime();

      // Event from 3 seconds before window start (within 5s tolerance)
      const lateTime = new Date(windowStart - 3000).toISOString();
      const event = createTestEvent(lateTime);

      const added = window.addEvent(event, "key1");
      expect(added).toBe(true);
    });

    it("should respect maxEvents limit", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 2,
      });

      const now = new Date().toISOString();

      window.addEvent(createTestEvent(now, "event1"), "key1");
      window.addEvent(createTestEvent(now, "event2"), "key1");

      const added = window.addEvent(createTestEvent(now, "event3"), "key1");
      expect(added).toBe(false);
      expect(window.getEventCount()).toBe(2);
    });

    it("should group events by key", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      const now = new Date().toISOString();

      window.addEvent(createTestEvent(now, "event1"), "key1");
      window.addEvent(createTestEvent(now, "event2"), "key1");
      window.addEvent(createTestEvent(now, "event3"), "key2");

      expect(window.getEvents("key1")).toHaveLength(2);
      expect(window.getEvents("key2")).toHaveLength(1);
      expect(window.getAllKeys().sort()).toEqual(["key1", "key2"]);
    });
  });

  describe("isExpired", () => {
    it("should identify expired windows", () => {
      const window = new TimeWindow({
        windowSize: 1000, // 1 second window
        lateTolerance: 500, // 0.5 second tolerance
        maxEvents: 100,
      });

      // Get the actual window end time from the TimeWindow instance
      // to avoid timing discrepancies between constructor and test
      const timeRange = window.getTimeRange();
      const windowEnd = new Date(timeRange.end).getTime();
      const windowStart = windowEnd - 1000; // Derive start from end

      expect(window.isExpired(windowStart)).toBe(false);
      expect(window.isExpired(windowEnd)).toBe(false); // End of window
      expect(window.isExpired(windowEnd + 499)).toBe(false); // Within tolerance
      expect(window.isExpired(windowEnd + 501)).toBe(true); // Just past tolerance
      expect(window.isExpired(windowEnd + 1000)).toBe(true); // Well past tolerance
    });
  });

  describe("clear", () => {
    it("should clear all events", () => {
      const window = new TimeWindow({
        windowSize: 30000,
        lateTolerance: 5000,
        maxEvents: 100,
      });

      const now = new Date().toISOString();
      window.addEvent(createTestEvent(now), "key1");
      window.addEvent(createTestEvent(now), "key2");

      expect(window.getEventCount()).toBe(2);

      window.clear();

      expect(window.getEventCount()).toBe(0);
      expect(window.getAllKeys()).toEqual([]);
    });
  });
});
