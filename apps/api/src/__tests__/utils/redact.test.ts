import { redactSecrets } from '../../utils/redact.js';

describe('redactSecrets', () => {
  it('redacts postgres credentials in URLs', () => {
    const s = redactSecrets('fail postgresql://boss:s3cret@host:5432/db');
    expect(s).toContain('postgresql://***:***@host:5432/db');
    expect(s).not.toContain('s3cret');
  });

  it('redacts stripe live/test keys', () => {
    expect(redactSecrets('key sk_live_abc123XYZ')).toBe('key sk_live_***');
    expect(redactSecrets('key sk_test_abc123XYZ')).toBe('key sk_test_***');
    expect(redactSecrets('whsec_abc123')).toBe('whsec_***');
  });

  it('redacts bearer tokens and JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart';
    expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toContain('Bearer ***');
    expect(redactSecrets(jwt)).toBe('jwt.***');
  });

  it('redacts Error messages containing passwords', () => {
    const err = new Error('password=supersecret failed');
    expect(redactSecrets(err)).toContain('password=***');
    expect(redactSecrets(err)).not.toContain('supersecret');
  });
});
