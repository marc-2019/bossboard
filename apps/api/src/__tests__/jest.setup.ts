/**
 * Jest Test Setup
 * Global setup for all tests
 */

// Set test environment variables.
// Preserve a caller-provided DATABASE_URL (GitHub Actions api-ci.yml) so live
// SQL proofs hit the CI Postgres service instead of a hardcoded compose port.
process.env.NODE_ENV = 'test';
process.env.PORT = '29001';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://bossboard:bossboard_dev_2026@localhost:29432/bossboard_test';
}
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:29379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_jwt_refresh_secret';

// Increase timeout for async tests
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Allow pending operations to complete
  await new Promise((resolve) => setTimeout(resolve, 500));
});
