// Debug the Peggy parser output
const { parse } = require('./packages/query-parser/dist/generated/parser');

const query = 'loki({service="frontend"})[5m] and on(request_id) loki({service="backend"})[5m]';

console.log('Parsing query:', query);

try {
  const result = parse(query);
  console.log('\nRaw parser output:');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Parse error:', error.message);
  if (error.location) {
    console.error('Location:', error.location);
  }
}