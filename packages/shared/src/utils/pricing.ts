/**
 * Cost + margin helpers for products and invoice lines.
 * Sell amount is always the customer-facing figure (cents).
 * Cost / margin are internal only — never show on PDF/email.
 */

/** Sell cents from cost cents + margin percent (e.g. 30 = 30%). */
export function sellAmountFromCostMargin(
  costCents: number,
  marginPercent: number,
): number {
  if (!Number.isFinite(costCents) || costCents < 0) return 0;
  if (!Number.isFinite(marginPercent)) return Math.round(costCents);
  return Math.round(costCents * (1 + marginPercent / 100));
}

/** Margin $ in cents (sell − cost). */
export function marginAmountCents(costCents: number, sellCents: number): number {
  return Math.round(sellCents) - Math.round(costCents);
}

/** Margin percent from cost + sell (null if cost is 0). */
export function marginPercentFromCostSell(
  costCents: number,
  sellCents: number,
): number | null {
  if (!costCents || costCents <= 0) return null;
  return Math.round(((sellCents - costCents) / costCents) * 10000) / 100;
}

export interface PricedLineLike {
  amount: number;
  cost?: number | null;
  marginPercent?: number | null;
}

export interface InvoiceProfitSummary {
  totalCost: number;
  totalSell: number;
  totalMargin: number;
  /** Overall margin % on cost; null if no cost on any line */
  overallMarginPercent: number | null;
  linesWithCost: number;
}

/** Sum cost/margin for lines that have cost set (internal P&L). */
export function computeInvoiceProfit(
  lineItems: PricedLineLike[],
): InvoiceProfitSummary {
  let totalCost = 0;
  let totalSell = 0;
  let linesWithCost = 0;

  for (const item of lineItems) {
    const sell = Math.round(item.amount || 0);
    totalSell += sell;
    const cost =
      item.cost != null && Number.isFinite(item.cost) && item.cost >= 0
        ? Math.round(item.cost)
        : null;
    if (cost != null) {
      totalCost += cost;
      linesWithCost += 1;
    }
  }

  const totalMargin = totalSell - totalCost;
  const overallMarginPercent =
    totalCost > 0
      ? Math.round((totalMargin / totalCost) * 10000) / 100
      : null;

  return {
    totalCost,
    totalSell,
    totalMargin,
    overallMarginPercent,
    linesWithCost,
  };
}

/**
 * Normalize a line for storage: if cost + margin% provided, amount = calculated sell.
 * Preserves explicit amount when cost/margin incomplete.
 */
export function normalizePricedLineItem<
  T extends {
    description: string;
    amount: number;
    cost?: number | null;
    marginPercent?: number | null;
  },
>(item: T): T & { amount: number; cost: number | null; marginPercent: number | null } {
  const cost =
    item.cost != null && Number.isFinite(item.cost) && item.cost >= 0
      ? Math.round(item.cost)
      : null;
  const marginPercent =
    item.marginPercent != null && Number.isFinite(item.marginPercent)
      ? Math.round(Number(item.marginPercent) * 100) / 100
      : null;

  let amount = Math.round(item.amount || 0);
  if (cost != null && marginPercent != null) {
    amount = sellAmountFromCostMargin(cost, marginPercent);
  }

  return {
    ...item,
    amount: Math.max(0, amount),
    cost,
    marginPercent,
  };
}
