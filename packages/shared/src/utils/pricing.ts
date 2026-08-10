/**
 * Cost + margin helpers for products and invoice lines.
 * Sell amount is always the customer-facing figure (cents).
 * Cost / margin are internal only — never show on PDF/email.
 *
 * Annual costs (e.g. web hosting paid yearly): store the full annual
 * amount on the product / line, but attribute 1/12 to each invoice for P&L
 * so one month is not wiped out while the rest look free.
 */

/** Months used when spreading an annual cost onto a single invoice. */
export const ANNUAL_COST_MONTHS = 12;

/**
 * Cost attributed to one invoice / period.
 * If `isAnnual`, costCents is the full yearly amount → divide by 12.
 */
export function attributedCostCents(
  costCents: number,
  isAnnual: boolean,
): number {
  if (!Number.isFinite(costCents) || costCents < 0) return 0;
  const rounded = Math.round(costCents);
  if (!isAnnual) return rounded;
  return Math.round(rounded / ANNUAL_COST_MONTHS);
}

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
  /**
   * Cost attributed to this invoice (cents). For annual costs this is the
   * monthly share (annual/12), not the full yearly amount.
   */
  cost?: number | null;
  marginPercent?: number | null;
  /** True when cost was derived from an annual total (display / re-edit). */
  costIsAnnual?: boolean | null;
  /** Full annual cost in cents when costIsAnnual (optional). */
  annualCost?: number | null;
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
 *
 * Annual: if `costIsAnnual` and `annualCost` set, attributed `cost` = annual/12.
 * If only `cost` is sent with `costIsAnnual`, treat `cost` as the full annual.
 */
export function normalizePricedLineItem<
  T extends {
    description: string;
    amount: number;
    cost?: number | null;
    marginPercent?: number | null;
    costIsAnnual?: boolean | null;
    annualCost?: number | null;
  },
>(
  item: T,
): T & {
  amount: number;
  cost: number | null;
  marginPercent: number | null;
  costIsAnnual: boolean;
  annualCost: number | null;
} {
  const costIsAnnual = Boolean(item.costIsAnnual);
  let annualCost: number | null =
    item.annualCost != null &&
    Number.isFinite(item.annualCost) &&
    item.annualCost >= 0
      ? Math.round(item.annualCost)
      : null;

  let rawCost: number | null =
    item.cost != null && Number.isFinite(item.cost) && item.cost >= 0
      ? Math.round(item.cost)
      : null;

  // If marked annual but only cost provided, treat cost as full annual
  if (costIsAnnual && annualCost == null && rawCost != null) {
    annualCost = rawCost;
  }

  const cost =
    costIsAnnual && annualCost != null
      ? attributedCostCents(annualCost, true)
      : rawCost;

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
    costIsAnnual: costIsAnnual && annualCost != null,
    annualCost: costIsAnnual ? annualCost : null,
  };
}
