/* eslint-env jest */
// Suppress console.error during tests since we have many tests
// that intentionally trigger errors to test error handling
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});
