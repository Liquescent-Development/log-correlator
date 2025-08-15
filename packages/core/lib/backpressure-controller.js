"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackpressureController = void 0;
const eventemitter3_1 = require("eventemitter3");
class BackpressureController extends eventemitter3_1.EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.buffer = [];
    this.isPaused = false;
    this.metrics = {
      totalProcessed: 0,
      totalDropped: 0,
      currentBufferSize: 0,
      pauseCount: 0,
      resumeCount: 0,
    };
  }
  async *controlFlow(source, processor) {
    for await (const item of source) {
      // Check buffer size
      if (this.buffer.length >= this.options.highWaterMark) {
        this.pause();
      }
      // Add to buffer if not at max capacity
      if (this.buffer.length < this.options.maxBufferSize) {
        this.buffer.push(item);
        this.metrics.currentBufferSize = this.buffer.length;
      } else {
        // Drop event if buffer is full
        this.metrics.totalDropped++;
        this.emit("eventDropped", item);
        continue;
      }
      // Process items from buffer when below low water mark
      while (this.buffer.length > 0 && !this.isPaused) {
        const bufferedItem = this.buffer.shift();
        this.metrics.currentBufferSize = this.buffer.length;
        try {
          await processor(bufferedItem);
          this.metrics.totalProcessed++;
          yield bufferedItem;
        } catch (error) {
          this.emit("processingError", { item: bufferedItem, error });
        }
        // Resume if buffer is below low water mark
        if (this.isPaused && this.buffer.length <= this.options.lowWaterMark) {
          this.resume();
        }
      }
    }
    // Process remaining items in buffer
    while (this.buffer.length > 0) {
      const bufferedItem = this.buffer.shift();
      await processor(bufferedItem);
      yield bufferedItem;
    }
  }
  pause() {
    if (!this.isPaused) {
      this.isPaused = true;
      this.metrics.pauseCount++;
      this.emit("paused", { bufferSize: this.buffer.length });
    }
  }
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.metrics.resumeCount++;
      this.emit("resumed", { bufferSize: this.buffer.length });
    }
  }
  getMetrics() {
    return { ...this.metrics };
  }
  clear() {
    this.buffer = [];
    this.metrics.currentBufferSize = 0;
    this.isPaused = false;
  }
}
exports.BackpressureController = BackpressureController;
//# sourceMappingURL=backpressure-controller.js.map
