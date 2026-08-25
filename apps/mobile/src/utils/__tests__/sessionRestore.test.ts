import { isDefinitiveAuthRejection } from '../sessionRestore';

describe('isDefinitiveAuthRejection', () => {
  it('is true for status-bearing 401 and 403', () => {
    expect(isDefinitiveAuthRejection({ status: 401 })).toBe(true);
    expect(isDefinitiveAuthRejection({ status: 403 })).toBe(true);
  });

  it('is true for thrown Error("401") / Error("403") (no status field)', () => {
    expect(isDefinitiveAuthRejection(new Error('401'))).toBe(true);
    expect(isDefinitiveAuthRejection(new Error('403'))).toBe(true);
  });

  it('is false for network, timeout, and 5xx', () => {
    expect(isDefinitiveAuthRejection({ name: 'NetworkError' })).toBe(false);
    expect(isDefinitiveAuthRejection({ name: 'TimeoutError' })).toBe(false);
    expect(isDefinitiveAuthRejection({ status: 500 })).toBe(false);
    expect(isDefinitiveAuthRejection(new Error('Cannot reach BossBoard servers'))).toBe(
      false
    );
    expect(isDefinitiveAuthRejection(null)).toBe(false);
  });
});
