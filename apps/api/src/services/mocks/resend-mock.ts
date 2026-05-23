/**
 * Resend Mock — Phase 6a (2026-05-23)
 *
 * Monkey-patches a real `Resend` SDK client so calls to `resend.emails.send()`
 * are captured in-memory instead of reaching api.resend.com. Only mounted
 * when `MOCK_EXTERNAL_SERVICES === 'true'` (see services/email.ts).
 *
 * IMPORTANT: When this mock is active, emails NEVER leave the process.
 * Verification codes and password-reset codes will not arrive in a real
 * inbox. E2E tests that need to read a code back must either:
 *   1. Pull it from the captured outbox via `getCapturedEmails()`, or
 *   2. Read it from the DB (verification_code column) directly.
 *
 * The mock matches the real SDK shape: `{ data, error }` discriminated union.
 *
 * Outbox capture lives in module scope so any spec / route / test fixture
 * can `import { getCapturedEmails, clearCapturedEmails } from
 * 'services/mocks/resend-mock'` to inspect / reset state between scenarios.
 */

import type { Resend } from 'resend';

export interface CapturedEmail {
  /** Synthetic message id we return to the caller. */
  id: string;
  /** Whatever `from` the caller passed, verbatim. */
  from: string;
  /** Normalised recipient list. */
  to: string[];
  /** Subject line. */
  subject: string;
  /** HTML body (may be undefined). */
  html?: string;
  /** Plain-text body (may be undefined). */
  text?: string;
  /** Names of any attached files. We do NOT keep the binary content. */
  attachmentNames: string[];
  /** Wall-clock when the mock captured the send. */
  sentAt: string;
}

const outbox: CapturedEmail[] = [];

/** Snapshot of all captured emails since the last clear. */
export function getCapturedEmails(): CapturedEmail[] {
  return outbox.slice();
}

/** Reset the captured outbox — call between scenarios for isolation. */
export function clearCapturedEmails(): void {
  outbox.length = 0;
}

function uuidv4Like(): string {
  // Resend message IDs are UUID-style. We don't need crypto-grade randomness
  // for mock IDs — a 32-hex string is fine and avoids a `crypto.randomUUID`
  // typing dance on older Node lib targets.
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i += 1) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Install mock implementations on a Resend SDK client instance.
 * Mutates the client in-place.
 */
export function installResendMock(resend: Resend): Resend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (resend.emails as any).send = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any
  ): Promise<{ data: { id: string } | null; error: { message: string; name?: string } | null }> => {
    const id = uuidv4Like();
    // Resend accepts `to` as string | string[]
    const recipients: string[] = Array.isArray(payload?.to)
      ? payload.to
      : payload?.to
        ? [payload.to]
        : [];

    const captured: CapturedEmail = {
      id,
      from: typeof payload?.from === 'string' ? payload.from : '',
      to: recipients,
      subject: typeof payload?.subject === 'string' ? payload.subject : '',
      html: typeof payload?.html === 'string' ? payload.html : undefined,
      text: typeof payload?.text === 'string' ? payload.text : undefined,
      attachmentNames: Array.isArray(payload?.attachments)
        ? payload.attachments.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any) => (typeof a?.filename === 'string' ? a.filename : 'attachment')
          )
        : [],
      sentAt: new Date().toISOString(),
    };
    outbox.push(captured);

    console.log(
      `[MockResend] captured email id=${id} to=${recipients.join(',')} subject="${captured.subject}"`
    );

    return { data: { id }, error: null };
  };

  return resend;
}

export default { installResendMock, getCapturedEmails, clearCapturedEmails };
