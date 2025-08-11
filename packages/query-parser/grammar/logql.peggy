// LogQL Parser Grammar for Peggy
// A PromQL-inspired query language for log correlation

Query
  = streams:StreamList filter:Filter? {
      const result = {
        leftStream: streams[0],
        rightStream: streams[1],
        joinType: streams[0].join?.type || 'and',
        joinKeys: streams[0].join?.keys || [],
        temporal: streams[0].join?.temporal,
        grouping: streams[0].join?.grouping,
        labelMappings: streams[0].join?.labelMappings,
        filter
      };
      
      if (streams.length > 2) {
        result.additionalStreams = streams.slice(2);
      }
      
      return result;
    }

StreamList
  = first:StreamExpr rest:(_ JoinedStream)* {
      return [first, ...rest.map(r => r[1])];
    }

JoinedStream
  = join:JoinOperator _ stream:StreamExpr {
      stream.join = join;
      return stream;
    }

StreamExpr
  = source:Identifier _ "(" _ selector:Selector _ ")" _ "[" _ duration:Duration _ "]" {
      return {
        source,
        selector: selector.text,
        timeRange: duration,
        selectorParsed: selector.parsed
      };
    }

Selector
  = LabelSelector
  / GraylogSelector  
  / PromQLSelector

LabelSelector
  = "{" _ matchers:LabelMatcherList? _ "}" {
      return {
        text: `{${matchers ? matchers.map(m => m.text).join(',') : ''}}`,
        parsed: { type: 'labels', matchers: matchers || [] }
      };
    }

GraylogSelector
  = matchers:GraylogMatcherList {
      return {
        text: matchers.map(m => m.text).join(','),
        parsed: { type: 'graylog', matchers }
      };
    }

PromQLSelector
  = metric:Identifier _ "{" _ matchers:LabelMatcherList? _ "}" {
      return {
        text: `${metric}{${matchers ? matchers.map(m => m.text).join(',') : ''}}`,
        parsed: { type: 'promql', metric, matchers: matchers || [] }
      };
    }

LabelMatcherList
  = first:LabelMatcher rest:(_ "," _ LabelMatcher)* {
      return [first, ...rest.map(r => r[3])];
    }

LabelMatcher
  = label:Identifier _ op:MatchOperator _ value:Value {
      return {
        text: `${label}${op}${value.raw}`,
        parsed: { label, op, value: value.value }
      };
    }

GraylogMatcherList
  = first:GraylogMatcher rest:(_ "," _ GraylogMatcher)* {
      return [first, ...rest.map(r => r[3])];
    }

GraylogMatcher
  = field:Identifier _ ":" _ value:GraylogValue {
      return {
        text: `${field}:${value}`,
        parsed: { field, value }
      };
    }

MatchOperator
  = "=~" / "!~" / "!=" / "="

Value
  = s:String { return { raw: s.raw, value: s.value }; }
  / i:Identifier { return { raw: i, value: i }; }

GraylogValue
  = String { return text(); }
  / Identifier

JoinOperator
  = type:JoinType __ "on" _ "(" _ keys:JoinKeyList _ ")" modifiers:JoinModifier* {
      const result = {
        type,
        keys: keys.keys,
        labelMappings: keys.mappings
      };
      
      modifiers.forEach(mod => {
        Object.assign(result, mod);
      });
      
      return result;
    }

JoinType
  = "and" / "or" / "unless"

JoinKeyList
  = first:JoinKey rest:(_ "," _ JoinKey)* {
      const allKeys = [first, ...rest.map(r => r[3])];
      const keys = [];
      const mappings = [];
      
      allKeys.forEach(k => {
        if (k.mapping) {
          mappings.push(k.mapping);
          keys.push(k.mapping.left);
        } else {
          keys.push(k.key);
        }
      });
      
      return {
        keys,
        mappings: mappings.length > 0 ? mappings : undefined
      };
    }

JoinKey
  = left:Identifier _ "=" _ right:Identifier {
      return { mapping: { left, right } };
    }
  / key:Identifier {
      return { key };
    }

JoinModifier
  = __ "within" _ "(" _ duration:Duration _ ")" {
      return { temporal: duration };
    }
  / __ "ignoring" _ "(" _ labels:LabelList _ ")" {
      return { ignoring: labels };
    }
  / __ group:GroupModifier {
      return { grouping: group };
    }

GroupModifier
  = side:GroupSide _ "(" _ labels:LabelList? _ ")" {
      return { side, labels: labels || [] };
    }
  / side:GroupSide {
      return { side, labels: [] };
    }

GroupSide
  = "group_left" { return 'left'; }
  / "group_right" { return 'right'; }

LabelList
  = first:Identifier rest:(_ "," _ Identifier)* {
      return [first, ...rest.map(r => r[3])];
    }

Filter
  = _ "{" _ matchers:LabelMatcherList _ "}" {
      return `{${matchers.map(m => m.text).join(',')}}`;
    }

Duration
  = num:Number unit:TimeUnit { return num + unit; }

TimeUnit
  = "s" / "m" / "h" / "d"

String
  = '"' chars:DoubleStringChar* '"' {
      return { raw: `"${chars.join('')}"`, value: chars.join('') };
    }
  / "'" chars:SingleStringChar* "'" {
      return { raw: `'${chars.join('')}'`, value: chars.join('') };
    }

DoubleStringChar
  = [^"\\]
  / "\\" char:. { return char; }

SingleStringChar
  = [^'\\]
  / "\\" char:. { return char; }

Identifier
  = [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

Number
  = [0-9]+ { return text(); }

// Whitespace
_ = [ \t\r\n]*
__ = [ \t\r\n]+