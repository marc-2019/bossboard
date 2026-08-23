/**
 * Reserved / documentation test addresses only (RFC 2606 + RFC 6761).
 * Demo login emails must not look like live tenant mailboxes.
 */

const RESERVED_HOSTS = new Set([
  'example.test',
  'example.com',
  'example.net',
  'example.org',
]);

export function isReservedTestEmail(email: string | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return false;
  const host = trimmed.slice(at + 1);
  if (RESERVED_HOSTS.has(host)) return true;
  if (host.endsWith('.example.test')) return true;
  const labels = host.split('.');
  return labels.length >= 2 && labels[labels.length - 1] === 'test';
}
