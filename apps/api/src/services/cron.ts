/**
 * Cron Service
 * Scheduled tasks for BossBoard
 *
 * Runs:
 * - Daily cert expiry check at 8:00 AM NZST
 * - Daily operator quote nudge at 8:00 AM NZST (P1.2, push only)
 * - Optional ilert health→heartbeat pinger (every 2 min, cloud-side)
 */

import cron, { type ScheduledTask } from 'node-cron';
import notificationsService from './notifications.js';
import { runIlertHealthPings } from './ilert-health-pinger.js';
import { runOperatorQuoteNudges } from './quoteOperatorNudgeRunner.js';

let certExpiryJob: ScheduledTask | null = null;
let operatorQuoteNudgeJob: ScheduledTask | null = null;
let ilertHealthJob: ScheduledTask | null = null;

/**
 * Start all cron jobs
 */
function start(): void {
  console.log('[Cron] Starting scheduled tasks...');

  // Run daily at 8:00 AM NZST (UTC+12 in winter, UTC+13 in summer)
  // We use 20:00 UTC which is ~8-9 AM NZ time depending on DST
  certExpiryJob = cron.schedule('0 20 * * *', async () => {
    console.log('[Cron] Running cert expiry check...');
    try {
      const result = await notificationsService.checkAndNotifyExpiringCerts();
      console.log(`[Cron] Cert expiry check complete: ${result.notified} notifications sent`);
    } catch (error) {
      console.error('[Cron] Cert expiry check failed:', error);
    }
  }, {
    timezone: 'Pacific/Auckland',
  });

  console.log('[Cron] Cert expiry check scheduled (daily at 8:00 AM NZST)');

  // Wrapper: node-cron v4 TaskFn receives TaskContext, not a Date.
  operatorQuoteNudgeJob = cron.schedule('0 8 * * *', () => {
    void runOperatorQuoteNudges();
  }, {
    timezone: 'Pacific/Auckland',
  });
  console.log('[Cron] Operator quote nudge scheduled (daily at 8:00 AM NZST)');

  // Cloud ilert pinger: health check then heartbeat (avoids home-internet false downs)
  if (
    process.env.ILERT_HEALTH_PINGER_ENABLED === 'true' ||
    process.env.ILERT_HEALTH_PINGER_ENABLED === '1'
  ) {
    ilertHealthJob = cron.schedule('*/2 * * * *', async () => {
      try {
        await runIlertHealthPings();
      } catch (error) {
        console.error('[Cron] ilert health pinger failed:', error);
      }
    });
    // Fire once on boot so status recovers immediately after deploy
    void runIlertHealthPings().catch((err) =>
      console.error('[Cron] ilert health pinger boot run failed:', err),
    );
    console.log('[Cron] ilert health→heartbeat pinger scheduled (every 2 min)');
  } else {
    console.log('[Cron] ilert health pinger disabled (set ILERT_HEALTH_PINGER_ENABLED=true)');
  }
}

/**
 * Stop all cron jobs (for graceful shutdown)
 */
function stop(): void {
  if (certExpiryJob) {
    certExpiryJob.stop();
    certExpiryJob = null;
  }
  if (operatorQuoteNudgeJob) {
    operatorQuoteNudgeJob.stop();
    operatorQuoteNudgeJob = null;
  }
  if (ilertHealthJob) {
    ilertHealthJob.stop();
    ilertHealthJob = null;
  }
  console.log('[Cron] All scheduled tasks stopped');
}

/**
 * Run cert expiry check manually (for testing / admin trigger)
 */
async function runCertExpiryCheckNow(): Promise<{ checked: number; notified: number }> {
  console.log('[Cron] Manual cert expiry check triggered...');
  const result = await notificationsService.checkAndNotifyExpiringCerts();
  console.log(`[Cron] Manual check complete: ${result.notified} notifications sent`);
  return result;
}

export default {
  start,
  stop,
  runCertExpiryCheckNow,
  runIlertHealthPings,
};
