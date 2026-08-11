/**
 * Authentication Service
 * User registration, login, and token management
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import db from './database.js';
import teamsService from './teams.js';
import { User, UserCreateInput, UserLoginInput, AuthTokens, JwtPayload } from '../types/index.js';
import { createError } from '../middleware/error.js';
import { isEmailConfigured, sendPasswordResetEmail, sendVerificationEmail } from './email.js';

const SALT_ROUNDS = 12;

/**
 * Register a new user
 */
export async function register(input: UserCreateInput): Promise<{ user: User; tokens: AuthTokens; verificationCode: string }> {
  // Check if user already exists
  const existingUser = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [input.email.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw createError('User with this email already exists', 409, 'USER_EXISTS');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Generate 6-digit verification code
  const verificationCode = generateVerificationCode();
  const codeExpiresAt = new Date();
  codeExpiresAt.setMinutes(codeExpiresAt.getMinutes() + 30); // 30 min expiry

  // Create user
  const result = await db.query<User>(
    `INSERT INTO users (id, email, password_hash, name, phone, trade_type, business_name, is_verified, onboarding_completed, is_active, verification_code, verification_code_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, true, $8, $9)
     RETURNING id, email, name, phone, trade_type as "tradeType", business_name as "businessName",
               is_verified as "isVerified", onboarding_completed as "onboardingCompleted",
               is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
               subscription_tier as "subscriptionTier"`,
    [
      uuidv4(),
      input.email.toLowerCase(),
      passwordHash,
      input.name || null,
      input.phone || null,
      input.tradeType || null,
      input.businessName || null,
      verificationCode,
      codeExpiresAt,
    ]
  );

  const user = result.rows[0];
  const tokens = await generateTokens(user);

  // Store refresh token
  await storeRefreshToken(user.id, tokens.refreshToken);

  // Send verification email
  if (isEmailConfigured()) {
    try {
      await sendVerificationEmail(user.email, verificationCode);
      console.log(`[VERIFY] Verification email sent to ${user.email}`);
    } catch (err) {
      console.error(`[VERIFY] Failed to send verification email to ${user.email}:`, err);
    }
  } else if (config.isDevelopment) {
    console.log(`[VERIFY] Code for ${user.email}: ${verificationCode}`);
  }

  return { user, tokens, verificationCode };
}

/**
 * Login a user
 */
export async function login(input: UserLoginInput): Promise<{ user: User; tokens: AuthTokens }> {
  // Find user
  const result = await db.query<User & { password_hash: string }>(
    `SELECT id, email, password_hash, name, phone, trade_type as "tradeType",
            business_name as "businessName", is_verified as "isVerified",
            onboarding_completed as "onboardingCompleted",
            is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
            subscription_tier as "subscriptionTier"
     FROM users
     WHERE email = $1 AND is_active = true`,
    [input.email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const userWithHash = result.rows[0];

  // Verify password
  const isValid = await bcrypt.compare(input.password, userWithHash.password_hash);
  if (!isValid) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Remove password hash from user object
  const { password_hash: _, ...user } = userWithHash;

  const tokens = await generateTokens(user as User);

  // Store refresh token
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: user as User, tokens };
}

/**
 * Refresh access token
 */
export async function refreshToken(token: string): Promise<AuthTokens> {
  try {
    // Verify refresh token
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    // Check if token is stored and not revoked
    const result = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM refresh_tokens
       WHERE token = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      throw createError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Get user
    const userResult = await db.query<User>(
      `SELECT id, email, name, phone, trade_type as "tradeType",
              business_name as "businessName", is_verified as "isVerified",
              onboarding_completed as "onboardingCompleted",
              is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
              subscription_tier as "subscriptionTier"
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      throw createError('User not found', 401, 'USER_NOT_FOUND');
    }

    const user = userResult.rows[0];

    // Revoke old refresh token
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
      [token]
    );

    // Generate new tokens
    const tokens = await generateTokens(user);

    // Store new refresh token
    await storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw createError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    throw error;
  }
}

/**
 * Logout user (revoke refresh token)
 */
export async function logout(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    // Revoke specific token
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND token = $2',
      [userId, refreshToken]
    );
  } else {
    // Revoke all tokens for user
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await db.query<User>(
    `SELECT id, email, name, phone, trade_type as "tradeType",
            business_name as "businessName", is_verified as "isVerified",
            onboarding_completed as "onboardingCompleted",
            is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
            subscription_tier as "subscriptionTier"
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Verify email with 6-digit code
 */
export async function verifyEmail(userId: string, code: string): Promise<User> {
  const result = await db.query<User & { verification_code: string; verification_code_expires_at: Date }>(
    `SELECT id, email, name, phone, trade_type as "tradeType",
            business_name as "businessName", is_verified as "isVerified",
            onboarding_completed as "onboardingCompleted",
            is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
            subscription_tier as "subscriptionTier",
            verification_code, verification_code_expires_at
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];

  if (user.isVerified) {
    throw createError('Email already verified', 400, 'ALREADY_VERIFIED');
  }

  if (!user.verification_code) {
    throw createError('No verification code found. Please request a new one.', 400, 'NO_CODE');
  }

  if (new Date() > new Date(user.verification_code_expires_at)) {
    throw createError('Verification code expired. Please request a new one.', 400, 'CODE_EXPIRED');
  }

  if (user.verification_code !== code) {
    throw createError('Invalid verification code', 400, 'INVALID_CODE');
  }

  // Mark as verified and clear the code
  const updated = await db.query<User>(
    `UPDATE users SET is_verified = true, verification_code = NULL, verification_code_expires_at = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, name, phone, trade_type as "tradeType",
               business_name as "businessName", is_verified as "isVerified",
               onboarding_completed as "onboardingCompleted",
               is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
               subscription_tier as "subscriptionTier"`,
    [userId]
  );

  return updated.rows[0];
}

/**
 * Resend verification code
 */
export async function resendVerification(userId: string): Promise<{ verificationCode: string }> {
  const result = await db.query<User>(
    `SELECT id, email, is_verified as "isVerified"
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (result.rows[0].isVerified) {
    throw createError('Email already verified', 400, 'ALREADY_VERIFIED');
  }

  const verificationCode = generateVerificationCode();
  const codeExpiresAt = new Date();
  codeExpiresAt.setMinutes(codeExpiresAt.getMinutes() + 30);

  await db.query(
    `UPDATE users SET verification_code = $1, verification_code_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [verificationCode, codeExpiresAt, userId]
  );

  // Send verification email
  if (isEmailConfigured()) {
    try {
      await sendVerificationEmail(result.rows[0].email, verificationCode);
      console.log(`[VERIFY] Verification email resent to ${result.rows[0].email}`);
    } catch (err) {
      console.error(`[VERIFY] Failed to resend verification email to ${result.rows[0].email}:`, err);
    }
  } else if (config.isDevelopment) {
    console.log(`[VERIFY] New code for ${result.rows[0].email}: ${verificationCode}`);
  }

  return { verificationCode };
}

/**
 * Complete onboarding
 */
export async function completeOnboarding(userId: string): Promise<User> {
  const result = await db.query<User>(
    `UPDATE users SET onboarding_completed = true, updated_at = NOW()
     WHERE id = $1 AND is_active = true
     RETURNING id, email, name, phone, trade_type as "tradeType",
               business_name as "businessName", is_verified as "isVerified",
               onboarding_completed as "onboardingCompleted",
               is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
               subscription_tier as "subscriptionTier"`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Update user profile
 */
export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, 'name' | 'phone' | 'tradeType' | 'businessName'>>
): Promise<User | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(updates.phone);
  }
  if (updates.tradeType !== undefined) {
    fields.push(`trade_type = $${paramIndex++}`);
    values.push(updates.tradeType);
  }
  if (updates.businessName !== undefined) {
    fields.push(`business_name = $${paramIndex++}`);
    values.push(updates.businessName);
  }

  if (fields.length === 0) {
    return getUserById(userId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await db.query<User>(
    `UPDATE users SET ${fields.join(', ')}
     WHERE id = $${paramIndex} AND is_active = true
     RETURNING id, email, name, phone, trade_type as "tradeType",
               business_name as "businessName", is_verified as "isVerified",
               onboarding_completed as "onboardingCompleted",
               is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt",
               subscription_tier as "subscriptionTier"`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Forgot password - generate reset code and send email
 */
export async function forgotPassword(email: string): Promise<void> {
  const result = await db.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );

  // Always return success to prevent email enumeration
  if (result.rows.length === 0) {
    return;
  }

  const user = result.rows[0];
  const resetCode = generateVerificationCode();
  const codeExpiresAt = new Date();
  codeExpiresAt.setMinutes(codeExpiresAt.getMinutes() + 30);

  await db.query(
    `UPDATE users SET verification_code = $1, verification_code_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [resetCode, codeExpiresAt, user.id]
  );

  // Send email if SMTP is configured, otherwise log for dev
  if (isEmailConfigured()) {
    try {
      await sendPasswordResetEmail(user.email, resetCode);
    } catch (err) {
      console.error(`[RESET] Failed to send reset email to ${user.email}:`, err);
    }
  } else if (config.isDevelopment) {
    console.log(`[RESET] Code for ${user.email}: ${resetCode}`);
  }
}

/**
 * Reset password with code
 */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const result = await db.query<{ id: string; verification_code: string; verification_code_expires_at: Date }>(
    `SELECT id, verification_code, verification_code_expires_at
     FROM users WHERE email = $1 AND is_active = true`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw createError('Invalid email or reset code', 400, 'INVALID_RESET');
  }

  const user = result.rows[0];

  if (!user.verification_code) {
    throw createError('No reset code found. Please request a new one.', 400, 'NO_CODE');
  }

  if (new Date() > new Date(user.verification_code_expires_at)) {
    throw createError('Reset code expired. Please request a new one.', 400, 'CODE_EXPIRED');
  }

  if (user.verification_code !== code) {
    throw createError('Invalid reset code', 400, 'INVALID_CODE');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db.query(
    `UPDATE users SET password_hash = $1, verification_code = NULL, verification_code_expires_at = NULL, updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, user.id]
  );

  // Revoke all refresh tokens for security
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [user.id]
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

async function generateTokens(user: User): Promise<AuthTokens> {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
  };

  // Enrich JWT with team info if user belongs to a team
  try {
    const teamInfo = await teamsService.getUserTeamInfo(user.id);
    if (teamInfo) {
      payload.teamId = teamInfo.teamId;
      payload.teamRole = teamInfo.teamRole;
    }
  } catch {
    // Team lookup failure shouldn't block auth
  }

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessTokenExpiry,
    algorithm: 'HS256',
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTokenExpiry,
    algorithm: 'HS256',
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  // Calculate expiry (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // ON CONFLICT (token) DO NOTHING handles the JWT iat-collision case:
  // when register and login happen within the same second for one user,
  // the JWTs are byte-identical (same payload + same secret => same
  // signature). The row already exists from the prior call, so a no-op
  // is correct — the client gets back the same valid token.
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO NOTHING`,
    [uuidv4(), userId, token, expiresAt]
  );
}

/**
 * Delete a user account and all associated data.
 * Google Play policy requires in-app account deletion (effective Dec 2023).
 * Cascading deletes remove all user-owned data across every table.
 */
async function deleteAccount(userId: string): Promise<void> {
  await db.transaction(async (client) => {
    // Remove user from any team they belong to
    await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);

    // Delete teams the user owns (and their members/invites)
    const ownedTeams = await client.query(
      'SELECT id FROM teams WHERE owner_id = $1',
      [userId]
    );
    for (const team of ownedTeams.rows) {
      await client.query('DELETE FROM team_invites WHERE team_id = $1', [team.id]);
      await client.query('DELETE FROM team_members WHERE team_id = $1', [team.id]);
      await client.query('DELETE FROM teams WHERE id = $1', [team.id]);
    }

    // Delete all user data (order matters for FK constraints)
    await client.query('DELETE FROM photos WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM expenses WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM job_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM certifications WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM quotes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM recurring_invoices WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM invoices WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM swms_documents WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    // Finally, delete the user record
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}

export default {
  register,
  login,
  refreshToken,
  logout,
  getUserById,
  updateUser,
  verifyEmail,
  resendVerification,
  completeOnboarding,
  forgotPassword,
  resetPassword,
  deleteAccount,
};


