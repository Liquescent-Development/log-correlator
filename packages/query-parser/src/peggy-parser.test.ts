import { PeggyQueryParser } from './peggy-parser';

describe('PeggyQueryParser', () => {
  let parser: PeggyQueryParser;

  beforeEach(() => {
    parser = new PeggyQueryParser();
  });

  describe('Basic queries', () => {
    it('should parse simple inner join', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.leftStream.source).toBe('loki');
      expect(result.leftStream.selector).toBe('{service="frontend"}');
      expect(result.leftStream.timeRange).toBe('5m');
      expect(result.rightStream.source).toBe('loki');
      expect(result.joinType).toBe('and');
      expect(result.joinKeys).toContain('request_id');
    });

    it('should parse left join', () => {
      const query = `loki({service="frontend"})[1h] or on(session_id) graylog(service:backend)[1h]`;

      const result = parser.parse(query);
      
      expect(result.joinType).toBe('or');
      expect(result.joinKeys).toContain('session_id');
    });

    it('should parse anti-join', () => {
      const query = `loki({service="frontend"})[30s] unless on(request_id) loki({service="backend"})[30s]`;

      const result = parser.parse(query);
      
      expect(result.joinType).toBe('unless');
    });
  });

  describe('Advanced features', () => {
    it('should parse temporal joins', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) within(30s) loki({service="backend"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.temporal).toBe('30s');
    });

    it('should parse label mappings', () => {
      const query = `loki({service="auth"})[5m] and on(session_id=trace_id) loki({service="api"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.labelMappings).toBeDefined();
      expect(result.labelMappings?.[0]).toEqual({
        left: 'session_id',
        right: 'trace_id'
      });
    });

    it('should parse group modifiers', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) group_left(session_id) loki({service="backend"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.grouping).toEqual({
        side: 'left',
        labels: ['session_id']
      });
    });

    it.skip('should parse ignoring clause', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) ignoring(timestamp) loki({service="backend"})[5m]`;

      const result = parser.parse(query);
      
      expect((result as any).ignoring).toContain('timestamp');
    });

    it('should parse filters', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m] {status=~"4..|5.."}`;

      const result = parser.parse(query);
      
      expect(result.filter).toBe('{status=~"4..|5.."}');
    });

    it('should parse multiple label matchers', () => {
      const query = `loki({service="frontend",level="error",instance!="localhost"})[5m] and on(request_id) loki({service="backend"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.leftStream.selector).toContain('service="frontend"');
      expect(result.leftStream.selector).toContain('level="error"');
      expect(result.leftStream.selector).toContain('instance!="localhost"');
    });
  });

  describe('Multi-stream queries', () => {
    it('should parse 3-stream correlation', () => {
      const query = `loki({job="nginx"})[5m] and on(request_id) graylog(service:api)[5m] and on(request_id) loki({job="database"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.leftStream.source).toBe('loki');
      expect(result.rightStream.source).toBe('graylog');
      expect(result.additionalStreams).toHaveLength(1);
      expect(result.additionalStreams?.[0].source).toBe('loki');
    });

    it('should parse complex multi-stream with different join types', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m] or on(session_id) loki({service="auth"})[5m]`;

      const result = parser.parse(query);
      
      expect(result.additionalStreams).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should provide detailed error for invalid syntax', () => {
      const query = 'invalid query syntax';
      
      const result = parser.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it.skip('should reject queries without join operator', () => {
      const query = 'loki({service="test"})[5m]';
      
      const result = parser.validate(query);
      
      expect(result.valid).toBe(false);
    });

    it('should reject queries with mismatched brackets', () => {
      const query = `loki({service="frontend")[5m] and on(request_id) loki({service="backend"})[5m]`;
      
      const result = parser.validate(query);
      
      expect(result.valid).toBe(false);
    });
  });

  describe('Autocomplete suggestions', () => {
    it.skip('should suggest time ranges after ]', () => {
      const query = 'loki({service="test"})';
      const suggestions = parser.getSuggestions(query, query.length);
      
      expect(suggestions).toContain('[5m]');
      expect(suggestions).toContain('[1m]');
      expect(suggestions).toContain('[30s]');
    });

    it('should suggest join operators after time range', () => {
      const query = 'loki({service="test"})[5m] ';
      const suggestions = parser.getSuggestions(query, query.length);
      
      expect(suggestions).toContain('and on(');
      expect(suggestions).toContain('or on(');
      expect(suggestions).toContain('unless on(');
    });

    it('should suggest common join keys', () => {
      const query = 'loki({service="test"})[5m] and on(';
      const suggestions = parser.getSuggestions(query, query.length);
      
      expect(suggestions).toContain('request_id');
      expect(suggestions).toContain('trace_id');
      expect(suggestions).toContain('session_id');
    });

    it('should suggest modifiers after join keys', () => {
      const query = 'loki({service="test"})[5m] and on(request_id) ';
      const suggestions = parser.getSuggestions(query, query.length);
      
      expect(suggestions).toContain('within(');
      expect(suggestions).toContain('group_left(');
      expect(suggestions).toContain('group_right(');
    });
  });

  describe('Query formatting', () => {
    it('should format a simple query', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m]`;
      const formatted = parser.formatQuery(query);
      
      expect(formatted).toContain('loki({service="frontend"})[5m]\n');
      expect(formatted).toContain('  and on(request_id)\n');
      expect(formatted).toContain('  loki({service="backend"})[5m]');
    });

    it('should format a complex query with modifiers', () => {
      const query = `loki({service="frontend"})[5m] and on(request_id) within(30s) group_left(session_id) loki({service="backend"})[5m] {status="500"}`;
      const formatted = parser.formatQuery(query);
      
      expect(formatted).toContain('within(30s)');
      expect(formatted).toContain('group_left(session_id)');
      expect(formatted).toContain('{status="500"}');
    });
  });
});