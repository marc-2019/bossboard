/**
 * Postgres adapters for the gated demo loader.
 *
 * Imported only after write gates pass so a Railway / production
 * DATABASE_URL is never opened by this path.
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../services/database.js';
import { encryptField, blindIndex } from '../utils/field-crypto.js';
import { assertSafeProcessTarget, gateFromEnv } from './gates.js';
import type { DemoUserStore } from './ensure-demo-user.js';
import type { DemoBooksSink } from './writer.js';

const SALT_ROUNDS = 12;

function assertAdaptersAllowed(): void {
  const gate = gateFromEnv(process.env, process.argv);
  if (!gate.allowed) {
    throw new Error(`demo adapter refused: ${gate.reason}`);
  }
  const processGate = assertSafeProcessTarget(process.env, process.env);
  if (!processGate.allowed) {
    throw new Error(`demo adapter refused: ${processGate.reason}`);
  }
}

export function createPgUserStore(): DemoUserStore {
  assertAdaptersAllowed();
  return {
    async findUserByEmail(email: string) {
      const result = await db.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [email],
      );
      return result.rows[0] ?? null;
    },
    async insertUser(row) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO users (
           id, email, password_hash, name, phone, trade_type, business_name,
           is_verified, onboarding_completed, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, true)
         RETURNING id`,
        [
          row.id,
          row.email,
          row.passwordHash,
          row.name,
          row.phone,
          row.tradeType,
          row.businessName,
        ],
      );
      const inserted = result.rows[0];
      if (!inserted) {
        throw new Error('demo user insert returned no id');
      }
      return { id: inserted.id };
    },
    async hashPassword(password: string) {
      return bcrypt.hash(password, SALT_ROUNDS);
    },
  };
}

export function createPgSink(): DemoBooksSink {
  assertAdaptersAllowed();
  return {
    async insertCustomer(row) {
      await db.query(
        `INSERT INTO customers (
           id, user_id, name, email, email_blind, phone, address, notes,
           default_include_gst
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          uuidv4(),
          row.userId,
          row.name,
          encryptField(row.email),
          blindIndex(row.email),
          encryptField(row.phone),
          encryptField(row.address),
          null,
        ],
      );
    },
    async insertInvoice(row) {
      await db.query(
        `INSERT INTO invoices (
           id, user_id, invoice_number,
           client_name, client_email, client_phone,
           job_description, line_items, subtotal, gst_amount, total,
           status, include_gst
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', true)`,
        [
          uuidv4(),
          row.userId,
          'DEMO-0001',
          row.clientName,
          row.clientEmail,
          row.clientPhone,
          row.jobDescription,
          JSON.stringify(row.lineItems),
          row.subtotal,
          row.gstAmount,
          row.total,
        ],
      );
    },
    async insertJobLog(row) {
      await db.query(
        `INSERT INTO job_logs (user_id, description, site_address, notes, status)
         VALUES ($1, $2, $3, $4, 'completed')`,
        [row.userId, row.description, row.siteAddress, row.notes],
      );
    },
    async insertSwms(row) {
      await db.query(
        `INSERT INTO swms_documents (
           id, user_id, template_type, title, status,
           job_description, site_address, client_name,
           hazards, controls, ppe_required, is_synced, local_id
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, true, $11)`,
        [
          uuidv4(),
          row.userId,
          row.templateType,
          row.title,
          row.jobDescription,
          row.siteAddress,
          row.clientName,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          uuidv4(),
        ],
      );
    },
  };
}

export async function closeDemoDb(): Promise<void> {
  await db.close();
}
