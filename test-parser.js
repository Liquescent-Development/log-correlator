// Test the Peggy parser directly
const {
  PeggyQueryParser,
} = require("./packages/query-parser/dist/peggy-parser");

console.log("Testing Peggy Query Parser\n");
console.log("=".repeat(50));

const parser = new PeggyQueryParser();

// Test cases
const testQueries = [
  {
    name: "Simple inner join",
    query:
      'loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m]',
  },
  {
    name: "Temporal join",
    query:
      'loki({service="frontend"})[5m] and on(request_id) within(30s) loki({service="backend"})[5m]',
  },
  {
    name: "Label mapping",
    query:
      'loki({service="auth"})[5m] and on(session_id=trace_id) loki({service="api"})[5m]',
  },
  {
    name: "Group modifier",
    query:
      'loki({service="frontend"})[5m] and on(request_id) group_left(session_id) loki({service="backend"})[5m]',
  },
  {
    name: "Multi-stream correlation",
    query:
      'loki({job="nginx"})[5m] and on(request_id) graylog(service:api)[5m] and on(request_id) loki({job="database"})[5m]',
  },
  {
    name: "With filter",
    query:
      'loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m] {status=~"4..|5.."}',
  },
];

for (const test of testQueries) {
  console.log(`\nTest: ${test.name}`);
  console.log(`Query: ${test.query}`);

  try {
    const result = parser.parse(test.query);
    console.log("✅ Parsed successfully");
    console.log(
      "Result:",
      JSON.stringify(
        {
          leftStream: result.leftStream?.source,
          rightStream: result.rightStream?.source,
          joinType: result.joinType,
          joinKeys: result.joinKeys,
          temporal: result.temporal,
          filter: result.filter,
          additionalStreams: result.additionalStreams?.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log("❌ Parse failed:", error.message);
  }
}

// Test autocomplete
console.log("\n" + "=".repeat(50));
console.log("Testing Autocomplete Suggestions\n");

const autocompleteTests = [
  {
    query: 'loki({service="test"})',
    position: 23,
    description: "After closing parenthesis",
  },
  {
    query: 'loki({service="test"})[5m] ',
    position: 28,
    description: "After time range",
  },
  {
    query: 'loki({service="test"})[5m] and on(',
    position: 35,
    description: "Inside join keys",
  },
];

for (const test of autocompleteTests) {
  console.log(`\nContext: ${test.description}`);
  console.log(`Query: "${test.query}"`);
  console.log(`Position: ${test.position}`);
  const suggestions = parser.getSuggestions(test.query, test.position);
  console.log("Suggestions:", suggestions);
}

// Test query formatting
console.log("\n" + "=".repeat(50));
console.log("Testing Query Formatting\n");

const uglyQuery =
  'loki({service="frontend"})[5m] and on(request_id) within(30s) group_left(session_id) loki({service="backend"})[5m] {status="500"}';
console.log("Original:", uglyQuery);
console.log("\nFormatted:");
console.log(parser.formatQuery(uglyQuery));

console.log("\n✅ All tests completed!");
