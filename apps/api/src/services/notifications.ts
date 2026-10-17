/**
 * Notifications Service
 * Handles push notifications via Expo Push Notifications API
 */

import db from './database.js';

// =============================================================================
// TYPES
// =============================================================================

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// EXPO PUSH API
// =============================================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send push notifications via Expo Push API
 */
async function sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  // Expo recommends sending in batches of 100
  const tickets: ExpoPushTicket[] = [];
  const batchSize = 100;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const result: any = await response.json();

      if (result.data) {
        tickets.push(...result.data);
      }
    } catch (error) {
      console.error('Failed to send push notification batch:', error);
      // Add error tickets for this batch
      batch.forEach(() => {
        tickets.push({ status: 'error', message: 'Failed to send' });
      });
    }
  }

  return tickets;
}

// =============================================================================
// PUSH TOKEN MANAGEMENT
// =============================================================================

/**
 * Save or update a user's push token
 */
async function savePushToken(userId: string, pushToken: string): Promise<void> {
  await db.query(
    `UPDATE users SET push_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [pushToken, userId]
  );
}

/**
 * Remove a user's push token (e.g., on logout)
 */
async function removePushToken(userId: string): Promise<void> {
  await db.query(
    `UPDATE users SET push_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId]
  );
}

/**
 * Get push token for a user
 */
async function getPushToken(userId: string): Promise<string | null> {
  const result = await db.query<{ push_token: string | null }>(
    `SELECT push_token FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.push_token || null;
}

/**
 * Get all users with push tokens (for bulk notifications)
 */
async function getAllUsersWithTokens(): Promise<Array<{ id: string; push_token: string; name: string | null }>> {
  const result = await db.query<{ id: string; push_token: string; name: string | null }>(
    `SELECT id, push_token, name FROM users WHERE push_token IS NOT NULL AND is_active = TRUE`
  );
  return result.rows;
}

// =============================================================================
// CERTIFICATION EXPIRY NOTIFICATIONS
// =============================================================================

interface ExpiringCert {
  id: string;
  user_id: string;
  name: string;
  cert_type: string;
  expiry_date: string;
  push_token: string;
  user_name: string | null;
}

/**
 * Check for expiring certifications and send push notifications
 * Called by the cron service daily
 */
async function checkAndNotifyExpiringCerts(): Promise<{ checked: number; notified: number }> {
  const thresholds = [30, 14, 7, 1]; // Days before expiry to notify
  let totalNotified = 0;

  for (const days of thresholds) {
    try {
      // Find certifications expiring in exactly N days that haven't been notified recently
      const result = await db.query<ExpiringCert>(
        `SELECT c.id, c.user_id, c.name, c.cert_type, c.expiry_date::text,
                u.push_token, u.name as user_name
         FROM certifications c
         JOIN users u ON c.user_id = u.id
         WHERE u.push_token IS NOT NULL
           AND u.is_active = TRUE
           AND c.expiry_date IS NOT NULL
           AND c.expiry_date = CURRENT_DATE + INTERVAL '${days} days'
           AND (c.last_reminder_at IS NULL OR c.last_reminder_at < CURRENT_DATE)`,
        []
      );

      if (result.rows.length === 0) continue;

      // Build push messages
      const messages: ExpoPushMessage[] = result.rows.map((cert) => ({
        to: cert.push_token,
        title: getExpiryTitle(days),
        body: getExpiryBody(cert.name, cert.cert_type, days),
        data: {
          type: 'cert_expiry',
          certificationId: cert.id,
          daysUntilExpiry: days,
        },
        sound: 'default' as const,
      }));

      // Send notifications
      const tickets = await sendPushNotifications(messages);

      // Mark certifications as notified
      const notifiedIds = result.rows
        .filter((_, index) => tickets[index]?.status === 'ok')
        .map((cert) => cert.id);

      if (notifiedIds.length > 0) {
        await db.query(
          `UPDATE certifications SET last_reminder_at = CURRENT_TIMESTAMP, reminder_sent = TRUE
           WHERE id = ANY($1)`,
          [notifiedIds]
        );
        totalNotified += notifiedIds.length;
      }

      console.log(`[Notifications] ${days}-day expiry: ${result.rows.length} certs found, ${notifiedIds.length} notified`);
    } catch (error) {
      console.error(`[Notifications] Error checking ${days}-day expiry:`, error);
    }
  }

  // Also check for already-expired certs (notify once)
  try {
    const expired = await db.query<ExpiringCert>(
      `SELECT c.id, c.user_id, c.name, c.cert_type, c.expiry_date::text,
              u.push_token, u.name as user_name
       FROM certifications c
       JOIN users u ON c.user_id = u.id
       WHERE u.push_token IS NOT NULL
         AND u.is_active = TRUE
         AND c.expiry_date IS NOT NULL
         AND c.expiry_date < CURRENT_DATE
         AND c.reminder_sent = FALSE`,
      []
    );

    if (expired.rows.length > 0) {
      const messages: ExpoPushMessage[] = expired.rows.map((cert) => ({
        to: cert.push_token,
        title: '⚠️ Certification Expired',
        body: `Your ${cert.cert_type || cert.name} has expired. Renew it as soon as you can.`,
        data: {
          type: 'cert_expired',
          certificationId: cert.id,
        },
        sound: 'default' as const,
      }));

      const tickets = await sendPushNotifications(messages);

      const notifiedIds = expired.rows
        .filter((_, index) => tickets[index]?.status === 'ok')
        .map((cert) => cert.id);

      if (notifiedIds.length > 0) {
        await db.query(
          `UPDATE certifications SET last_reminder_at = CURRENT_TIMESTAMP, reminder_sent = TRUE
           WHERE id = ANY($1)`,
          [notifiedIds]
        );
        totalNotified += notifiedIds.length;
      }

      console.log(`[Notifications] Expired certs: ${expired.rows.length} found, ${notifiedIds.length} notified`);
    }
  } catch (error) {
    console.error('[Notifications] Error checking expired certs:', error);
  }

  return { checked: thresholds.length + 1, notified: totalNotified };
}

// =============================================================================
// NOTIFICATION TEXT HELPERS
// =============================================================================

function getExpiryTitle(days: number): string {
  if (days === 1) return '🚨 Certification Expires Tomorrow!';
  if (days <= 7) return '⚠️ Certification Expiring Soon';
  return '📋 Certification Expiry Reminder';
}

function getExpiryBody(name: string, certType: string, days: number): string {
  const certName = certType || name;
  if (days === 1) return `Your ${certName} expires tomorrow. Renew now to avoid compliance issues.`;
  if (days === 7) return `Your ${certName} expires in 1 week. Time to start the renewal process.`;
  if (days === 14) return `Your ${certName} expires in 2 weeks. Plan your renewal.`;
  return `Your ${certName} expires in ${days} days. Consider starting your renewal.`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  sendPushNotifications,
  savePushToken,
  removePushToken,
  getPushToken,
  getAllUsersWithTokens,
  checkAndNotifyExpiringCerts,
};
