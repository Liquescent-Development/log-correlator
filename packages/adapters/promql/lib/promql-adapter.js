"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromQLAdapter = void 0;
const log_correlator_core_1 = require("@liquescent/log-correlator-core");
const node_fetch_1 = __importDefault(require("node-fetch"));
class PromQLAdapter {
    constructor(options) {
        this.options = options;
        // Setup authentication
        if (options.apiToken) {
            this.authHeader = `Bearer ${options.apiToken}`;
        }
        else if (options.username && options.password) {
            const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
            this.authHeader = `Basic ${credentials}`;
        }
        else {
            this.authHeader = '';
        }
    }
    async *createStream(query, options) {
        const timeRange = options?.timeRange || '5m';
        const limit = options?.limit || 1000;
        // Parse PromQL selector
        const selectorMatch = query.match(/^([^{]+)?(\{[^}]*\})?$/);
        if (!selectorMatch) {
            throw new log_correlator_core_1.CorrelationError('Invalid PromQL selector', 'PROMQL_PARSE_ERROR');
        }
        const metricName = selectorMatch[1]?.trim() || '';
        const labelSelector = selectorMatch[2] || '';
        // Construct the full PromQL query
        const promqlQuery = metricName + labelSelector;
        if (this.options.pollInterval && this.options.pollInterval > 0) {
            // Polling mode
            yield* this.createPollingStream(promqlQuery, timeRange, limit);
        }
        else {
            // One-time query
            yield* this.queryMetrics(promqlQuery, timeRange, limit);
        }
    }
    async *createPollingStream(query, timeRange, limit) {
        this.abortController = new AbortController();
        while (!this.abortController.signal.aborted) {
            try {
                const events = await this.fetchMetrics(query, timeRange, limit);
                for (const event of events) {
                    yield event;
                }
                // Wait before next poll
                await this.sleep(this.options.pollInterval);
            }
            catch (error) {
                if (error.name === 'AbortError') {
                    break;
                }
                console.error('PromQL polling error:', error);
                // Continue polling after error
                await this.sleep(this.options.pollInterval);
            }
        }
    }
    async *queryMetrics(query, timeRange, limit) {
        const events = await this.fetchMetrics(query, timeRange, limit);
        for (const event of events) {
            yield event;
        }
    }
    async fetchMetrics(query, timeRange, limit) {
        const now = Date.now();
        const duration = this.parseTimeRange(timeRange);
        const start = new Date(now - duration).toISOString();
        const end = new Date(now).toISOString();
        // Calculate appropriate step based on time range
        const step = Math.max(15, Math.floor(duration / 1000 / 100)); // Max 100 data points
        const params = {
            query,
            start,
            end,
            step: `${step}s`
        };
        const response = await this.queryPrometheus(params);
        return this.transformMetricsToEvents(response, limit);
    }
    async queryPrometheus(params) {
        const url = `${this.options.url}/api/v1/query_range`;
        const queryParams = new URLSearchParams({
            query: params.query,
            start: params.start.toString(),
            end: params.end.toString(),
            step: params.step
        });
        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            timeout: this.options.timeout || 30000
        };
        if (this.authHeader) {
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Authorization': this.authHeader
            };
        }
        if (this.abortController) {
            fetchOptions.signal = this.abortController.signal;
        }
        const response = await (0, node_fetch_1.default)(`${url}?${queryParams}`, fetchOptions);
        if (!response.ok) {
            throw new log_correlator_core_1.CorrelationError(`Prometheus query failed: ${response.statusText}`, 'PROMQL_QUERY_ERROR', { status: response.status });
        }
        return await response.json();
    }
    transformMetricsToEvents(response, limit) {
        const events = [];
        // Handle scalar and string result types
        if (response.data.resultType === 'scalar' || response.data.resultType === 'string') {
            const [timestamp, val] = response.data.result;
            const isoTimestamp = new Date(timestamp * 1000).toISOString();
            const event = {
                timestamp: isoTimestamp,
                source: 'promql',
                message: `metric=${val}`,
                labels: {
                    __value__: val
                },
                joinKeys: {}
            };
            events.push(event);
            return events;
        }
        // Handle matrix and vector result types
        for (const series of response.data.result) {
            const { metric, values = [], value } = series;
            // Handle both matrix and vector responses
            const dataPoints = values.length > 0 ? values : (value ? [value] : []);
            for (const [timestamp, val] of dataPoints) {
                if (events.length >= limit)
                    break;
                // Convert Prometheus timestamp (seconds) to ISO string
                const isoTimestamp = new Date(timestamp * 1000).toISOString();
                // Create a log event from the metric
                const event = {
                    timestamp: isoTimestamp,
                    source: 'promql',
                    message: `${this.getMetricName(metric)}=${val}`,
                    labels: {
                        ...metric,
                        __value__: val
                    },
                    joinKeys: metric
                };
                events.push(event);
            }
        }
        return events;
    }
    getMetricName(metric) {
        // Try to extract metric name from __name__ label
        return metric.__name__ || 'metric';
    }
    parseTimeRange(timeRange) {
        const match = timeRange.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new log_correlator_core_1.CorrelationError('Invalid time range format', 'PROMQL_PARSE_ERROR');
        }
        const value = parseInt(match[1]);
        const unit = match[2];
        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: throw new log_correlator_core_1.CorrelationError('Invalid time unit', 'PROMQL_PARSE_ERROR');
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    validateQuery(query) {
        // Basic validation - check for valid PromQL syntax
        try {
            // Empty queries are invalid
            if (!query || query.trim() === '') {
                return false;
            }
            // Check for basic metric name or selector
            // Either: metric_name{labels} or just {labels} or just metric_name
            // Metric names can contain letters, digits, underscore, and colon
            // They must start with letter, underscore or colon
            const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
            const metricWithLabelsPattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*\{[^}]*\}$/;
            const labelsOnlyPattern = /^\{[^}]+\}$/;
            return metricNamePattern.test(query) ||
                metricWithLabelsPattern.test(query) ||
                labelsOnlyPattern.test(query);
        }
        catch {
            return false;
        }
    }
    getName() {
        return 'promql';
    }
    async getAvailableStreams() {
        // Query Prometheus for available metric names
        const url = `${this.options.url}/api/v1/label/__name__/values`;
        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            timeout: this.options.timeout || 30000
        };
        if (this.authHeader) {
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Authorization': this.authHeader
            };
        }
        try {
            const response = await (0, node_fetch_1.default)(url, fetchOptions);
            if (!response.ok) {
                console.error('Failed to fetch metric names:', response.statusText);
                return [];
            }
            const data = await response.json();
            return data.data || [];
        }
        catch (error) {
            console.error('Error fetching available metrics:', error);
            return [];
        }
    }
    async destroy() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = undefined;
        }
    }
}
exports.PromQLAdapter = PromQLAdapter;
//# sourceMappingURL=promql-adapter.js.map