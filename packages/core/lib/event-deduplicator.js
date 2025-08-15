"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventDeduplicator = void 0;
const crypto = __importStar(require("crypto"));
class EventDeduplicator {
  constructor(options) {
    this.options = options;
    this.seenHashes = new Map();
    // Start cleanup timer
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, options.windowSize);
  }
  /**
   * Check if an event is a duplicate
   * @returns true if duplicate, false if new event
   */
  isDuplicate(event) {
    const hash = this.computeHash(event);
    const now = Date.now();
    // Check if we've seen this hash recently
    const lastSeen = this.seenHashes.get(hash);
    if (lastSeen && now - lastSeen < this.options.windowSize) {
      return true; // Duplicate within window
    }
    // Mark as seen
    this.seenHashes.set(hash, now);
    // Enforce max cache size
    if (
      this.options.maxCacheSize &&
      this.seenHashes.size > this.options.maxCacheSize
    ) {
      this.cleanup();
    }
    return false;
  }
  /**
   * Filter out duplicate events from a stream
   */
  async *deduplicate(stream) {
    for await (const event of stream) {
      if (!this.isDuplicate(event)) {
        yield event;
      }
    }
  }
  computeHash(event) {
    const fields = this.options.hashFields || [
      "timestamp",
      "message",
      "source",
    ];
    const data = {};
    // Extract specified fields for hashing
    for (const field of fields) {
      if (field === "timestamp") data.timestamp = event.timestamp;
      else if (field === "message") data.message = event.message;
      else if (field === "source") data.source = event.source;
      else if (field === "labels" && event.labels) {
        data.labels = JSON.stringify(event.labels);
      }
    }
    // Create hash
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    return hash;
  }
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.options.windowSize;
    // Remove old entries
    for (const [hash, timestamp] of this.seenHashes.entries()) {
      if (timestamp < cutoff) {
        this.seenHashes.delete(hash);
      }
    }
  }
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.seenHashes.clear();
  }
}
exports.EventDeduplicator = EventDeduplicator;
//# sourceMappingURL=event-deduplicator.js.map
