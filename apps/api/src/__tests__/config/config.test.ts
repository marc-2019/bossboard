/**
 * Config Tests
 *
 * Exercises the env-driven branches in src/config/index.ts: default fallbacks
 * when env vars are unset vs the provided values when set, the three CORS
 * resolution paths, the production fail-fast validation (required vars,
 * BETA_MODE=false Stripe requirements), and NODE_ENV validation.
 *
 * dotenv is mocked to a no-op so the on-disk .env can't leak into these
 * deterministic env-permutation scenarios.
 */

jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));

/**
 * Load a fresh copy of the config module under an exact process.env.
 * Replaces process.env entirely (not merged) so unset-var fallbacks are real.
 */
function loadConfig(env: Record<string, string>): { config: any } {
  let mod: { config: any } = { config: undefined };
  jest.isolateModules(() => {
    const saved = process.env;
    process.env = { ...env };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = { config: require('../../config/index.js').config };
    } finally {
      process.env = saved;
    }
  });
  return mod;
}

describe('config', () => {
  describe('defaults when env unset', () => {
    const { config } = loadConfig({ NODE_ENV: 'development' });

    it('uses branding/server/db/redis fallbacks', () => {
      expect(config.appName).toBe('BossBoard');
      expect(config.appDomain).toBe('');
      expect(config.port).toBe(29000);
      expect(config.nodeEnv).toBe('development');
      expect(config.isDevelopment).toBe(true);
      expect(config.databaseUrl).toContain('postgresql://');
      expect(config.redisUrl).toBe('redis://localhost:29379');
    });

    it('uses dev CORS allow-list when CORS_ORIGINS unset and not production', () => {
      expect(config.corsOrigins).toContain('http://localhost:3000');
    });

    it('uses Stripe/SMTP/GA4 fallbacks', () => {
      expect(config.stripe.returnUrl).toBe('http://localhost:19006');
      expect(config.stripe.secretKey).toBe('');
      expect(config.smtp.port).toBe(587);
      expect(config.smtp.secure).toBe(false);
      expect(config.smtp.fromName).toBe('BossBoard');
      expect(config.ga4.measurementId).toBe('G-83NPHN0QP5');
      expect(config.ga4.mpApiSecret).toBe('');
    });
  });

  describe('provided env values override defaults', () => {
    const { config } = loadConfig({
      NODE_ENV: 'development',
      APP_NAME: 'CustomApp',
      APP_DOMAIN: 'custom.example',
      PORT: '8080',
      DATABASE_URL: 'postgresql://u:p@db/x',
      REDIS_URL: 'redis://r:1',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      CORS_ORIGINS: 'https://one.app,https://two.app',
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec',
      STRIPE_PRICE_ID_TRADIE: 'price_tradie',
      STRIPE_PRICE_ID_TEAM: 'price_team',
      STRIPE_RETURN_URL: 'https://return.app',
      SMTP_HOST: 'smtp.example',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      SMTP_FROM_NAME: 'Sender',
      SMTP_FROM_EMAIL: 'from@example',
      RESEND_API_KEY: 're_test',
      GA4_MEASUREMENT_ID: 'G-CUSTOM',
      GA4_MP_API_SECRET: 'mp_secret',
    });

    it('reflects all provided overrides', () => {
      expect(config.appName).toBe('CustomApp');
      expect(config.appDomain).toBe('custom.example');
      expect(config.port).toBe(8080);
      expect(config.databaseUrl).toBe('postgresql://u:p@db/x');
      expect(config.redisUrl).toBe('redis://r:1');
      expect(config.anthropicApiKey).toBe('sk-ant-test');
      expect(config.corsOrigins).toEqual(['https://one.app', 'https://two.app']);
      expect(config.stripe.secretKey).toBe('sk_test');
      expect(config.stripe.returnUrl).toBe('https://return.app');
      expect(config.smtp.port).toBe(465);
      expect(config.smtp.secure).toBe(true);
      expect(config.smtp.fromName).toBe('Sender');
      expect(config.resendApiKey).toBe('re_test');
      expect(config.ga4.measurementId).toBe('G-CUSTOM');
      expect(config.ga4.mpApiSecret).toBe('mp_secret');
    });
  });

  describe('production validation', () => {
    const prodBase = {
      NODE_ENV: 'production',
      JWT_SECRET: 'js',
      JWT_REFRESH_SECRET: 'jrs',
      DATABASE_URL: 'postgresql://u:p@db/x',
      // Present in production; value is a test placeholder (not a real key).
      FIELD_ENCRYPTION_KEY: 'test-placeholder-field-encryption-key-not-a-real-secret',
    };

    it('passes with required vars present (BETA_MODE unset → beta defaults)', () => {
      const { config } = loadConfig({ ...prodBase, CORS_ORIGINS: 'https://app', STRIPE_WEBHOOK_SECRET: 'whsec' });
      expect(config.isDevelopment).toBe(false);
      // production with no CORS_ORIGINS → empty deny-all list path is exercised elsewhere
      expect(config.corsOrigins).toEqual(['https://app']);
    });

    it('production with CORS_ORIGINS unset resolves to deny-all empty list', () => {
      const { config } = loadConfig({ ...prodBase, STRIPE_WEBHOOK_SECRET: 'whsec' });
      expect(config.corsOrigins).toEqual([]);
    });

    it('throws when a required var is missing in production', () => {
      expect(() => loadConfig({ NODE_ENV: 'production', JWT_REFRESH_SECRET: 'jrs', DATABASE_URL: 'x' })).toThrow(
        /JWT_SECRET environment variable is required in production/
      );
    });

    it('throws when FIELD_ENCRYPTION_KEY is missing in production', () => {
      const { FIELD_ENCRYPTION_KEY: _drop, ...withoutKey } = prodBase;
      expect(() => loadConfig(withoutKey)).toThrow(
        /FIELD_ENCRYPTION_KEY is required in production/,
      );
    });

    it('passes BETA_MODE=false when all paid-checkout vars are set', () => {
      const { config } = loadConfig({
        ...prodBase,
        BETA_MODE: 'false',
        STRIPE_RETURN_URL: 'https://return.app',
        STRIPE_SECRET_KEY: 'sk_live',
        STRIPE_PRICE_ID_TRADIE: 'price_tradie',
      });
      expect(config.stripe.returnUrl).toBe('https://return.app');
    });

    it('throws when BETA_MODE=false and STRIPE_RETURN_URL is localhost', () => {
      expect(() =>
        loadConfig({ ...prodBase, BETA_MODE: 'false', STRIPE_RETURN_URL: 'http://localhost:19006' })
      ).toThrow(/STRIPE_RETURN_URL must be set to a non-localhost URL/);
    });

    it('throws when BETA_MODE=false and STRIPE_SECRET_KEY is missing', () => {
      expect(() =>
        loadConfig({ ...prodBase, BETA_MODE: 'false', STRIPE_RETURN_URL: 'https://return.app' })
      ).toThrow(/STRIPE_SECRET_KEY is required in production when BETA_MODE=false/);
    });

    it('throws when BETA_MODE=false and STRIPE_PRICE_ID_TRADIE is missing', () => {
      expect(() =>
        loadConfig({
          ...prodBase,
          BETA_MODE: 'false',
          STRIPE_RETURN_URL: 'https://return.app',
          STRIPE_SECRET_KEY: 'sk_live',
        })
      ).toThrow(/STRIPE_PRICE_ID_TRADIE is required in production when BETA_MODE=false/);
    });
  });

  describe('NODE_ENV validation', () => {
    it('accepts a known NODE_ENV value', () => {
      const { config } = loadConfig({ NODE_ENV: 'test' });
      expect(config.nodeEnv).toBe('test');
    });

    it('throws on an unknown NODE_ENV value', () => {
      expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/Invalid NODE_ENV/);
    });
  });
});
