/**
 * Invoice due dates are bare YYYY-MM-DD calendar keys.
 * `new Date('YYYY-MM-DD')` is UTC midnight, so local formatting prints the
 * previous day in America/Los_Angeles. Instants (created_at, paid_at) still
 * follow the process timezone.
 *
 * Node reads TZ at process start, so each zone is a child process.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

interface CalendarDatePayload {
  tz: string | null;
  pdfDue: boolean;
  pdfPreviousDay: boolean;
  emailHtmlDue: boolean;
  emailHtmlPrevious: boolean;
  emailTextDue: boolean;
  emailTextPrevious: boolean;
  pageDue: boolean;
  pagePaidPrevious: boolean;
  pagePaidSameDay: boolean;
}

const testsDir = path.resolve(__dirname, '../../../tests');
const script = path.join(testsDir, 'calendar-due-date.tz.ts');
const tsconfig = path.join(testsDir, 'tsconfig.calendar.json');
const tsxBin = path.resolve(__dirname, '../../../../../node_modules/.bin/tsx');
const apiRoot = path.resolve(__dirname, '../../..');

function runZone(tz: string): CalendarDatePayload {
  const result = spawnSync(tsxBin, ['--tsconfig', tsconfig, script], {
    env: { ...process.env, TZ: tz, MOCK_RESEND: 'true' },
    encoding: 'utf8',
    cwd: apiRoot,
    timeout: 60000,
  });
  const line = (result.stdout || '')
    .split('\n')
    .map((entry) => entry.trim())
    .reverse()
    .find((entry) => entry.startsWith('CALENDAR_DATE_RESULT '));
  if (result.status !== 0 || !line) {
    throw new Error(
      `TZ=${tz} exited ${result.status}\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }
  return JSON.parse(line.slice('CALENDAR_DATE_RESULT '.length)) as CalendarDatePayload;
}

describe('invoice due dates west of UTC', () => {
  it('prints 25 Oct 2026 in Los Angeles, Auckland, and UTC', () => {
    for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC'] as const) {
      const payload = runZone(tz);
      expect(payload.tz).toBe(tz);

      expect(payload.pdfDue).toBe(true);
      expect(payload.emailHtmlDue).toBe(true);
      expect(payload.emailHtmlPrevious).toBe(false);
      expect(payload.emailTextDue).toBe(true);
      expect(payload.emailTextPrevious).toBe(false);
      expect(payload.pageDue).toBe(true);

      // created_at / paid_at are instants at 2026-10-25T00:00:00.000Z.
      // That local day is the 24th only west of UTC.
      const shifted = tz === 'America/Los_Angeles';
      expect(payload.pdfPreviousDay).toBe(shifted);
      expect(payload.pagePaidPrevious).toBe(shifted);
      expect(payload.pagePaidSameDay).toBe(!shifted);
    }
  }, 90000);
});
