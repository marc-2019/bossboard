/**
 * Create or return the dedicated local demo login (user_id).
 *
 * Credentials are env-only (DEMO_USER_EMAIL / DEMO_USER_PASSWORD). The
 * same write gates as the books loader apply. Email must be a reserved
 * test address. Persona fields come from the fictional e2e fixture only.
 */

import { randomUUID } from 'node:crypto';
import { gateFromEnv } from './gates.js';
import { DEMO_PERSONA } from './fixtures.js';
import { isReservedTestEmail } from './reserved-email.js';

export type DemoUserInsert = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  tradeType: string;
  businessName: string;
};

export type DemoUserStore = {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  insertUser: (row: DemoUserInsert) => Promise<{ id: string }>;
  hashPassword: (password: string) => Promise<string>;
};

export type EnsureDemoUserInput = {
  env: NodeJS.ProcessEnv;
  argv: string[];
  store: DemoUserStore;
};

export type EnsureDemoUserResult =
  | { created: true; userId: string }
  | { created: false; userId: string }
  | { created: false; reason: string };

export async function ensureDemoUser(
  input: EnsureDemoUserInput,
): Promise<EnsureDemoUserResult> {
  const gate = gateFromEnv(input.env, input.argv);
  if (!gate.allowed) {
    return { created: false, reason: gate.reason };
  }

  const email = input.env.DEMO_USER_EMAIL?.trim().toLowerCase() ?? '';
  const password = input.env.DEMO_USER_PASSWORD;
  if (!isReservedTestEmail(email)) {
    return {
      created: false,
      reason: 'DEMO_USER_EMAIL must be a reserved test address',
    };
  }
  if (!password) {
    return { created: false, reason: 'DEMO_USER_PASSWORD is not set' };
  }

  const existing = await input.store.findUserByEmail(email);
  if (existing) {
    return { created: false, userId: existing.id };
  }

  const id = input.env.DEMO_USER_ID?.trim() || randomUUID();
  const passwordHash = await input.store.hashPassword(password);
  const inserted = await input.store.insertUser({
    id,
    email,
    passwordHash,
    name: DEMO_PERSONA.name,
    phone: DEMO_PERSONA.phone,
    tradeType: DEMO_PERSONA.tradeType,
    businessName: DEMO_PERSONA.businessName,
  });
  return { created: true, userId: inserted.id };
}
