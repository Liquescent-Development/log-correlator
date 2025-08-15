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
var __exportStar =
  (this && this.__exportStar) ||
  function (m, exports) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p))
        __createBinding(exports, m, p);
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParallelProcessor =
  exports.IndexedEventStore =
  exports.EventDeduplicator =
  exports.PerformanceMonitor =
  exports.BackpressureController =
  exports.TimeWindow =
  exports.MultiStreamJoiner =
  exports.StreamJoiner =
  exports.CorrelationEngine =
    void 0;
var correlation_engine_1 = require("./correlation-engine");
Object.defineProperty(exports, "CorrelationEngine", {
  enumerable: true,
  get: function () {
    return correlation_engine_1.CorrelationEngine;
  },
});
var stream_joiner_1 = require("./stream-joiner");
Object.defineProperty(exports, "StreamJoiner", {
  enumerable: true,
  get: function () {
    return stream_joiner_1.StreamJoiner;
  },
});
var multi_stream_joiner_1 = require("./multi-stream-joiner");
Object.defineProperty(exports, "MultiStreamJoiner", {
  enumerable: true,
  get: function () {
    return multi_stream_joiner_1.MultiStreamJoiner;
  },
});
var time_window_1 = require("./time-window");
Object.defineProperty(exports, "TimeWindow", {
  enumerable: true,
  get: function () {
    return time_window_1.TimeWindow;
  },
});
var backpressure_controller_1 = require("./backpressure-controller");
Object.defineProperty(exports, "BackpressureController", {
  enumerable: true,
  get: function () {
    return backpressure_controller_1.BackpressureController;
  },
});
var performance_monitor_1 = require("./performance-monitor");
Object.defineProperty(exports, "PerformanceMonitor", {
  enumerable: true,
  get: function () {
    return performance_monitor_1.PerformanceMonitor;
  },
});
var event_deduplicator_1 = require("./event-deduplicator");
Object.defineProperty(exports, "EventDeduplicator", {
  enumerable: true,
  get: function () {
    return event_deduplicator_1.EventDeduplicator;
  },
});
var indexed_event_store_1 = require("./indexed-event-store");
Object.defineProperty(exports, "IndexedEventStore", {
  enumerable: true,
  get: function () {
    return indexed_event_store_1.IndexedEventStore;
  },
});
var parallel_processor_1 = require("./parallel-processor");
Object.defineProperty(exports, "ParallelProcessor", {
  enumerable: true,
  get: function () {
    return parallel_processor_1.ParallelProcessor;
  },
});
__exportStar(require("./types"), exports);
__exportStar(require("./utils"), exports);
//# sourceMappingURL=index.js.map
