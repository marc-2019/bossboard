import { resolvePoolSsl } from '../../utils/database-ssl.js';

describe('resolvePoolSsl', () => {
  const prodUrl = 'postgresql://u:p@mainline.proxy.rlwy.net:39912/railway';
  const localUrl = 'postgresql://bossboard:bossboard_dev_2026@localhost:29432/bossboard';

  it('enables SSL in production for Railway proxy without strict CA verify', () => {
    expect(resolvePoolSsl(prodUrl, 'production', {})).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('enables SSL with strict verify for unknown remote hosts', () => {
    const other = 'postgresql://u:p@db.example.com:5432/app';
    expect(resolvePoolSsl(other, 'production', {})).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('disables SSL for localhost even in production', () => {
    expect(resolvePoolSsl(localUrl, 'production', {})).toBe(false);
  });

  it('disables SSL in development by default', () => {
    expect(resolvePoolSsl(prodUrl, 'development', {})).toBe(false);
    expect(resolvePoolSsl(localUrl, 'development', {})).toBe(false);
  });

  it('honours DATABASE_SSL=false override', () => {
    expect(resolvePoolSsl(prodUrl, 'production', { DATABASE_SSL: 'false' })).toBe(false);
  });

  it('honours DATABASE_SSL=true in development', () => {
    expect(resolvePoolSsl(localUrl, 'development', { DATABASE_SSL: 'true' })).toEqual({
      rejectUnauthorized: true, // localhost is not a PaaS proxy
    });
  });

  it('allows forcing strict cert verify on Railway', () => {
    expect(
      resolvePoolSsl(prodUrl, 'production', {
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      })
    ).toEqual({ rejectUnauthorized: true });
  });
});
