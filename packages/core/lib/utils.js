"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimeWindow = parseTimeWindow;
exports.formatDuration = formatDuration;
exports.generateCorrelationId = generateCorrelationId;
exports.isValidTimestamp = isValidTimestamp;
exports.extractLabels = extractLabels;
exports.debounce = debounce;
function parseTimeWindow(window) {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error(`Invalid time window format: ${window}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's':
            return value * 1000;
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        default:
            throw new Error(`Unknown time unit: ${unit}`);
    }
}
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    if (ms < 60000) {
        return `${Math.floor(ms / 1000)}s`;
    }
    if (ms < 3600000) {
        return `${Math.floor(ms / 60000)}m`;
    }
    return `${Math.floor(ms / 3600000)}h`;
}
function generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function isValidTimestamp(timestamp) {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
}
function extractLabels(logLine) {
    const labels = {};
    // Try to extract key=value pairs, handling quoted and unquoted values
    const kvPattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    let match;
    while ((match = kvPattern.exec(logLine)) !== null) {
        const key = match[1];
        // Value is in match[2] (double quotes), match[3] (single quotes), or match[4] (unquoted)
        const value = match[2] || match[3] || match[4];
        labels[key] = value;
    }
    return labels;
}
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
//# sourceMappingURL=utils.js.map