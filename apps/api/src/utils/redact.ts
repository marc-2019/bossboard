/**
 * Redact secrets / credentials from strings before logging.
 * Never log raw DATABASE_URL, API keys, JWTs, or Authorization headers.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // postgres://user:pass@host → postgres://***:***@host
  [/([a-z]+:\/\/)([^:/\s]+):([^@/\s]+)@/gi, '$1***:***@'],
  // Stripe keys
  [/\bsk_(live|test)_[A-Za-z0-9]+\b/g, 'sk_$1_***'],
  [/\bpk_(live|test)_[A-Za-z0-9]+\b/g, 'pk_$1_***'],
  [/\bwhsec_[A-Za-z0-9]+\b/g, 'whsec_***'],
  // Bearer tokens / JWT-ish
  [/\bBearer\s+[A-Za-z0-9._\-]+\b/gi, 'Bearer ***'],
  [/\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g, 'jwt.***'],
  // Generic API key style env assignments in messages
  [/\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?([^\s'"]+)/gi, '$1=***'],
];

export function redactSecrets(input: unknown): string {
  let text: string;
  if (input == null) {
    text = String(input);
  } else if (typeof input === 'string') {
    text = input;
  } else if (input instanceof Error) {
    text = `${input.name}: ${input.message}${input.stack ? `\n${input.stack}` : ''}`;
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }
  for (const [re, replacement] of PATTERNS) {
    text = text.replace(re, replacement);
  }
  return text;
}

export default redactSecrets;
