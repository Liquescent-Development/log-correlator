"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelationError = void 0;
class CorrelationError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "CorrelationError";
    this.code = code;
    this.details = details;
  }
}
exports.CorrelationError = CorrelationError;
//# sourceMappingURL=types.js.map
