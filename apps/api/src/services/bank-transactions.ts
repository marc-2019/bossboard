/**
 * Bank Transactions Service
 * Multi-format bank CSV import (Wise + NZ banks), listing, invoice reconciliation
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import {
  BankTransaction,
  MatchConfidence,
} from '../types/index.js';

/** Detected CSV export shape (header fingerprint). */
export type BankCsvFormat = 'wise' | 'anz' | 'asb' | 'bnz' | 'generic';

type ParsedBankTxn = {
  transactionId: string | null;
  date: string;
  amount: number;
  currency: string;
  description: string | null;
  paymentReference: string | null;
  runningBalance: number | null;
};

/**
 * Transform DB row to BankTransaction type
 */
function transformTransaction(row: Record<string, unknown>): BankTransaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    transactionId: row.transaction_id as string | null,
    date: row.date as string,
    amount: row.amount as number,
    currency: row.currency as string,
    description: row.description as string | null,
    paymentReference: row.payment_reference as string | null,
    runningBalance: row.running_balance as number | null,
    matchedInvoiceId: row.matched_invoice_id as string | null,
    matchConfidence: row.match_confidence as MatchConfidence,
    isReconciled: row.is_reconciled as boolean,
    reconciledAt: row.reconciled_at as Date | null,
    uploadBatchId: row.upload_batch_id as string | null,
    sourceFilename: row.source_filename as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(txn: BankTransaction): Record<string, unknown> {
  return {
    id: txn.id,
    user_id: txn.userId,
    transaction_id: txn.transactionId,
    date: txn.date,
    amount: txn.amount,
    currency: txn.currency,
    description: txn.description,
    payment_reference: txn.paymentReference,
    running_balance: txn.runningBalance,
    matched_invoice_id: txn.matchedInvoiceId,
    match_confidence: txn.matchConfidence,
    is_reconciled: txn.isReconciled,
    reconciled_at: txn.reconciledAt,
    upload_batch_id: txn.uploadBatchId,
    source_filename: txn.sourceFilename,
    created_at: txn.createdAt,
    updated_at: txn.updatedAt,
  };
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalize various date formats to YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string | null {
  const trimmed = dateStr.trim().replace(/"/g, '');

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10);
  }

  // Try DD-MM-YYYY or DD/MM/YYYY (NZ date format)
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try Date.parse as fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }

  return null;
}

/** Parse money string to integer cents; null if unparseable. */
function parseAmountToCents(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+') return null;
  const amountFloat = parseFloat(cleaned);
  if (isNaN(amountFloat)) return null;
  return Math.round(amountFloat * 100);
}

function cell(cols: string[], idx: number): string {
  if (idx < 0 || idx >= cols.length) return '';
  return (cols[idx] || '').trim();
}

function joinNonEmpty(parts: string[], sep = ' '): string | null {
  const joined = parts.map((p) => p.trim()).filter(Boolean).join(sep);
  return joined || null;
}

/** Stable short id for rows without a bank-supplied transaction id (de-dupe). */
function contentHashId(
  date: string,
  amount: number,
  description: string | null,
  paymentReference: string | null
): string {
  const payload = `${date}|${amount}|${description || ''}|${paymentReference || ''}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function buildHeaderMap(headerLine: string): Record<string, number> {
  const header = parseCSVLine(headerLine);
  const headerMap: Record<string, number> = {};
  header.forEach((col, idx) => {
    headerMap[col.trim().toLowerCase()] = idx;
  });
  return headerMap;
}

/**
 * Detect export format from header fingerprint.
 * Fixtures document sample headers for wise / anz / asb / bnz.
 */
export function detectBankCsvFormat(headerLine: string): BankCsvFormat {
  const keys = Object.keys(buildHeaderMap(headerLine));
  const has = (...names: string[]) => names.every((n) => keys.includes(n));
  const hasAny = (...names: string[]) => names.some((n) => keys.includes(n));

  // Wise: TransferWise ID or currency + payment reference style export
  if (
    hasAny('transferwise id') ||
    (hasAny('currency', 'source currency') &&
      hasAny('payment reference', 'source amount', 'created on'))
  ) {
    return 'wise';
  }

  // ASB FastNet: Unique Id + Tran Type + Payee + Memo + Amount
  if (has('unique id') && hasAny('tran type', 'payee') && has('amount')) {
    return 'asb';
  }

  // ANZ NZ classic accounting export
  // Type,Details,Particulars,Code,Reference,Amount,Date,...
  if (
    has('type', 'details', 'particulars', 'amount', 'date') &&
    hasAny('reference', 'code')
  ) {
    return 'anz';
  }

  // BNZ internet banking / business export
  // Date,Amount,Payee,Particulars,Code,Reference,Tran Type,...
  // or Date,Amount,...,Particulars,Code,Reference,Tran Type,This Party Account,...
  if (
    has('date', 'amount') &&
    has('tran type') &&
    has('particulars') &&
    hasAny('this party account', 'other party account', 'payee', 'serial')
  ) {
    return 'bnz';
  }

  return 'generic';
}

function resolveColumnIndices(
  headerMap: Record<string, number>,
  format: BankCsvFormat
): {
  idIdx: number;
  dateIdx: number;
  amountIdx: number;
  debitIdx: number;
  creditIdx: number;
  currencyIdx: number;
  descParts: number[];
  refIdx: number;
  balIdx: number;
} {
  const h = headerMap;

  if (format === 'asb') {
    return {
      idIdx: h['unique id'] ?? -1,
      dateIdx: h['date'] ?? 0,
      amountIdx: h['amount'] ?? -1,
      debitIdx: -1,
      creditIdx: -1,
      currencyIdx: h['currency'] ?? -1,
      // Prefer payee as description; memo often holds invoice ref
      descParts: [h['payee'] ?? -1, h['memo'] ?? -1].filter((i) => i >= 0),
      refIdx: h['memo'] ?? h['reference'] ?? h['payment reference'] ?? -1,
      balIdx: h['balance'] ?? h['running balance'] ?? -1,
    };
  }

  if (format === 'anz') {
    return {
      idIdx: h['transaction id'] ?? h['id'] ?? -1,
      dateIdx: h['date'] ?? h['processed date'] ?? 0,
      amountIdx: h['amount'] ?? -1,
      debitIdx: h['debit'] ?? -1,
      creditIdx: h['credit'] ?? -1,
      currencyIdx: h['currency'] ?? -1,
      descParts: [
        h['details'] ?? -1,
        h['particulars'] ?? -1,
        h['code'] ?? -1,
      ].filter((i) => i >= 0),
      refIdx: h['reference'] ?? h['payment reference'] ?? -1,
      balIdx: h['balance'] ?? h['running balance'] ?? -1,
    };
  }

  if (format === 'bnz') {
    return {
      // Serial is the stable bank-side id when present
      idIdx: h['serial'] ?? h['transaction id'] ?? h['id'] ?? -1,
      dateIdx: h['date'] ?? h['processed date'] ?? 0,
      amountIdx: h['amount'] ?? -1,
      debitIdx: h['debit'] ?? -1,
      creditIdx: h['credit'] ?? -1,
      currencyIdx: h['currency'] ?? -1,
      descParts: [
        h['payee'] ?? -1,
        h['other party'] ?? -1,
        h['particulars'] ?? -1,
        h['code'] ?? -1,
        h['tran type'] ?? -1,
      ].filter((i) => i >= 0),
      refIdx: h['reference'] ?? h['payment reference'] ?? h['particulars'] ?? -1,
      balIdx: h['balance'] ?? h['running balance'] ?? -1,
    };
  }

  // wise + generic: header aliases (Wise-oriented, works for simple Date/Amount exports)
  return {
    idIdx:
      h['transferwise id'] ??
      h['id'] ??
      h['transaction id'] ??
      h['unique id'] ??
      -1,
    dateIdx: h['date'] ?? h['created on'] ?? h['processed date'] ?? 0,
    amountIdx: h['amount'] ?? h['source amount'] ?? 1,
    debitIdx: h['debit'] ?? -1,
    creditIdx: h['credit'] ?? -1,
    currencyIdx: h['currency'] ?? h['source currency'] ?? -1,
    descParts: [
      h['description'] ?? -1,
      h['merchant'] ?? -1,
      h['payee'] ?? -1,
      h['details'] ?? -1,
      h['memo'] ?? -1,
    ].filter((i) => i >= 0),
    refIdx:
      h['payment reference'] ?? h['reference'] ?? h['memo'] ?? -1,
    balIdx: h['running balance'] ?? h['balance'] ?? -1,
  };
}

/**
 * Parse bank CSV into normalised rows (amounts in cents, dates YYYY-MM-DD).
 * Credits positive for match path; NZD default.
 */
export function parseBankCSV(csvContent: string): {
  format: BankCsvFormat;
  transactions: ParsedBankTxn[];
} {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { format: 'generic', transactions: [] };
  }

  const format = detectBankCsvFormat(lines[0]);
  const headerMap = buildHeaderMap(lines[0]);
  const colsMap = resolveColumnIndices(headerMap, format);

  // No date/amount columns → empty (caller reports no imports)
  if (colsMap.amountIdx < 0 && colsMap.debitIdx < 0 && colsMap.creditIdx < 0) {
    return { format, transactions: [] };
  }

  const transactions: ParsedBankTxn[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    let amount: number | null = null;
    if (colsMap.amountIdx >= 0) {
      amount = parseAmountToCents(cols[colsMap.amountIdx]);
    } else if (colsMap.debitIdx >= 0 || colsMap.creditIdx >= 0) {
      const debit = parseAmountToCents(cols[colsMap.debitIdx]);
      const credit = parseAmountToCents(cols[colsMap.creditIdx]);
      if (credit != null && credit !== 0) {
        amount = Math.abs(credit);
      } else if (debit != null && debit !== 0) {
        amount = -Math.abs(debit);
      }
    }
    if (amount == null) continue;

    const date = normalizeDate(cell(cols, colsMap.dateIdx));
    if (!date) continue;

    let runningBalance: number | null = null;
    if (colsMap.balIdx >= 0 && cols[colsMap.balIdx]) {
      runningBalance = parseAmountToCents(cols[colsMap.balIdx]);
    }

    const description = joinNonEmpty(
      colsMap.descParts.map((idx) => cell(cols, idx))
    );
    const paymentReference =
      colsMap.refIdx >= 0 ? cell(cols, colsMap.refIdx) || null : null;

    let transactionId =
      colsMap.idIdx >= 0 ? cell(cols, colsMap.idIdx) || null : null;
    if (!transactionId) {
      transactionId = contentHashId(date, amount, description, paymentReference);
    }

    const currencyRaw =
      colsMap.currencyIdx >= 0 ? cell(cols, colsMap.currencyIdx) : '';
    const currency = (currencyRaw || 'NZD').toUpperCase();

    transactions.push({
      transactionId,
      date,
      amount,
      currency,
      description,
      paymentReference,
      runningBalance,
    });
  }

  return { format, transactions };
}

/**
 * Upload CSV and import transactions
 */
export async function uploadCSV(
  userId: string,
  csvContent: string,
  filename: string
): Promise<{
  imported: number;
  duplicates: number;
  batchId: string;
  format: BankCsvFormat;
}> {
  const { format, transactions } = parseBankCSV(csvContent);
  const batchId = uuidv4();
  let imported = 0;
  let duplicates = 0;

  for (const txn of transactions) {
    try {
      await db.query(
        `INSERT INTO bank_transactions (
          id, user_id, transaction_id, date, amount, currency,
          description, payment_reference, running_balance,
          upload_batch_id, source_filename
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          uuidv4(),
          userId,
          txn.transactionId,
          txn.date,
          txn.amount,
          txn.currency,
          txn.description,
          txn.paymentReference,
          txn.runningBalance,
          batchId,
          filename,
        ]
      );
      imported++;
    } catch (error: unknown) {
      // Unique constraint violation = duplicate
      if ((error as { code?: string }).code === '23505') {
        duplicates++;
      } else {
        throw error;
      }
    }
  }

  return { imported, duplicates, batchId, format };
}

/**
 * List bank transactions for user
 */
export async function listTransactions(
  userId: string,
  options: {
    isReconciled?: boolean;
    startDate?: string;
    endDate?: string;
    batchId?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ transactions: Record<string, unknown>[]; total: number }> {
  const { isReconciled, startDate, endDate, batchId, limit = 50, offset = 0 } = options;

  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (isReconciled !== undefined) {
    conditions.push(`is_reconciled = $${paramIndex++}`);
    params.push(isReconciled);
  }

  if (startDate) {
    conditions.push(`date >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`date <= $${paramIndex++}`);
    params.push(endDate);
  }

  if (batchId) {
    conditions.push(`upload_batch_id = $${paramIndex++}`);
    params.push(batchId);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM bank_transactions WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM bank_transactions
     WHERE ${whereClause}
     ORDER BY date DESC, created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const transactions = result.rows.map((row) =>
    transformForMobile(transformTransaction(row))
  );

  return { transactions, total };
}

/**
 * Run simple auto-matching algorithm
 * Matches credit transactions to outstanding invoices by amount and reference/description
 */
export async function autoMatch(
  userId: string
): Promise<{ matched: number; suggestions: Record<string, unknown>[] }> {
  // Get unreconciled credit transactions
  const txnResult = await db.query<Record<string, unknown>>(
    `SELECT * FROM bank_transactions
     WHERE user_id = $1 AND is_reconciled = false AND amount > 0
       AND matched_invoice_id IS NULL
     ORDER BY date DESC`,
    [userId]
  );

  // Get outstanding invoices
  const invResult = await db.query<Record<string, unknown>>(
    `SELECT id, invoice_number, client_name, total, status
     FROM invoices
     WHERE user_id = $1 AND status IN ('sent', 'overdue')`,
    [userId]
  );

  const suggestions: Record<string, unknown>[] = [];
  let matched = 0;

  for (const txn of txnResult.rows) {
    const txnAmount = txn.amount as number;
    const txnRef = ((txn.payment_reference as string) || '').toLowerCase();
    const txnDesc = ((txn.description as string) || '').toLowerCase();

    let bestMatch: Record<string, unknown> | null = null;
    let bestConfidence: MatchConfidence = 'none';

    for (const inv of invResult.rows) {
      const invTotal = inv.total as number;
      const invNumber = ((inv.invoice_number as string) || '').toLowerCase();
      const invClient = ((inv.client_name as string) || '').toLowerCase();

      // Check exact amount match
      if (txnAmount === invTotal) {
        // Check if reference contains invoice number
        if (txnRef.includes(invNumber) || txnDesc.includes(invNumber)) {
          bestMatch = inv;
          bestConfidence = 'high';
          break; // Best possible match
        }

        // Check if description contains client name
        if (invClient && (txnRef.includes(invClient) || txnDesc.includes(invClient))) {
          if (bestConfidence !== 'high') {
            bestMatch = inv;
            bestConfidence = 'high';
          }
        } else {
          // Exact amount only
          if (bestConfidence === 'none') {
            bestMatch = inv;
            bestConfidence = 'medium';
          }
        }
      } else {
        // Close amount (within 5%)
        const diff = Math.abs(txnAmount - invTotal);
        const threshold = invTotal * 0.05;
        if (diff <= threshold && diff > 0 && bestConfidence === 'none') {
          bestMatch = inv;
          bestConfidence = 'low';
        }
      }
    }

    if (bestMatch && bestConfidence !== 'none') {
      // Update transaction with match suggestion
      await db.query(
        `UPDATE bank_transactions
         SET matched_invoice_id = $1, match_confidence = $2, updated_at = NOW()
         WHERE id = $3`,
        [bestMatch.id, bestConfidence, txn.id]
      );

      matched++;
      suggestions.push({
        transaction_id: txn.id,
        invoice_id: bestMatch.id,
        invoice_number: bestMatch.invoice_number,
        client_name: bestMatch.client_name,
        transaction_amount: txnAmount,
        invoice_total: bestMatch.total,
        confidence: bestConfidence,
      });
    }
  }

  return { matched, suggestions };
}

/**
 * Confirm a match: mark transaction as reconciled and invoice as paid
 */
export async function confirmMatch(
  transactionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  return db.transaction(async (client) => {
    // Get transaction with match
    const txnResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM bank_transactions
       WHERE id = $1 AND user_id = $2 AND matched_invoice_id IS NOT NULL
       FOR UPDATE`,
      [transactionId, userId]
    );

    if (txnResult.rows.length === 0) return null;

    const txn = txnResult.rows[0];
    const invoiceId = txn.matched_invoice_id as string;

    // Mark transaction as reconciled
    await client.query(
      `UPDATE bank_transactions
       SET is_reconciled = true, match_confidence = 'confirmed',
           reconciled_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [transactionId]
    );

    // Mark invoice as paid
    await client.query(
      `UPDATE invoices
       SET status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status IN ('sent', 'overdue')`,
      [invoiceId, userId]
    );

    // Return updated transaction
    const updated = await client.query<Record<string, unknown>>(
      'SELECT * FROM bank_transactions WHERE id = $1',
      [transactionId]
    );

    return transformForMobile(transformTransaction(updated.rows[0]));
  });
}

/**
 * Unmatch a transaction
 */
export async function unmatchTransaction(
  transactionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE bank_transactions
     SET matched_invoice_id = NULL, match_confidence = 'none',
         is_reconciled = false, reconciled_at = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [transactionId, userId]
  );

  if (result.rows.length === 0) return null;

  return transformForMobile(transformTransaction(result.rows[0]));
}

/**
 * Get transaction summary stats
 */
export async function getTransactionSummary(
  userId: string
): Promise<Record<string, unknown>> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_reconciled = true) as reconciled,
      COUNT(*) FILTER (WHERE is_reconciled = false) as unreconciled,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) as total_credits,
      COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0) as total_debits
     FROM bank_transactions WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    total: parseInt(row.total as string, 10),
    reconciled: parseInt(row.reconciled as string, 10),
    unreconciled: parseInt(row.unreconciled as string, 10),
    total_credits: parseInt(row.total_credits as string, 10),
    total_debits: parseInt(row.total_debits as string, 10),
  };
}

export default {
  uploadCSV,
  listTransactions,
  autoMatch,
  confirmMatch,
  unmatchTransaction,
  getTransactionSummary,
};
