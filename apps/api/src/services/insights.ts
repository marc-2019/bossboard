/**
 * Insights Service
 * Revenue analytics, invoice aging, top customers, monthly trends
 */

import db from './database.js';

export interface RevenueComparison {
  thisMonth: number;       // cents
  lastMonth: number;       // cents
  percentChange: number;   // e.g. 15.5 means +15.5%
}

export interface InvoiceAging {
  current: number;    // 0-30 days, count
  thirtyDay: number;  // 31-60 days, count
  sixtyDay: number;   // 61-90 days, count
  ninetyPlus: number; // 90+ days, count
  currentAmount: number;
  thirtyDayAmount: number;
  sixtyDayAmount: number;
  ninetyPlusAmount: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  revenue: number; // cents
  invoiceCount: number;
}

export interface MonthlyRevenue {
  month: string;   // e.g. "2026-02"
  label: string;   // e.g. "Feb"
  revenue: number; // cents
  count: number;
}

export interface InsightsData {
  revenue: RevenueComparison;
  aging: InvoiceAging;
  topCustomers: TopCustomer[];
  monthlyRevenue: MonthlyRevenue[];
}

/**
 * Get revenue comparison: this month vs last month
 */
async function getRevenueComparison(userId: string): Promise<RevenueComparison> {
  const result = await db.query<{
    this_month: string;
    last_month: string;
  }>(
    `SELECT
      COALESCE(SUM(total) FILTER (
        WHERE status = 'paid'
        AND paid_at >= date_trunc('month', CURRENT_DATE)
      ), 0) as this_month,
      COALESCE(SUM(total) FILTER (
        WHERE status = 'paid'
        AND paid_at >= date_trunc('month', CURRENT_DATE) - interval '1 month'
        AND paid_at < date_trunc('month', CURRENT_DATE)
      ), 0) as last_month
     FROM invoices WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  const thisMonth = parseInt(row.this_month, 10);
  const lastMonth = parseInt(row.last_month, 10);

  let percentChange = 0;
  if (lastMonth > 0) {
    percentChange = Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
  } else if (thisMonth > 0) {
    percentChange = 100;
  }

  return { thisMonth, lastMonth, percentChange };
}

/**
 * Get outstanding invoice aging buckets
 */
async function getInvoiceAging(userId: string): Promise<InvoiceAging> {
  const result = await db.query<{
    current_count: string;
    thirty_count: string;
    sixty_count: string;
    ninety_count: string;
    current_amount: string;
    thirty_amount: string;
    sixty_amount: string;
    ninety_amount: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date <= 30) as current_count,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60) as thirty_count,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90) as sixty_count,
      COUNT(*) FILTER (WHERE CURRENT_DATE - due_date > 90) as ninety_count,
      COALESCE(SUM(total) FILTER (WHERE CURRENT_DATE - due_date <= 30), 0) as current_amount,
      COALESCE(SUM(total) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0) as thirty_amount,
      COALESCE(SUM(total) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0) as sixty_amount,
      COALESCE(SUM(total) FILTER (WHERE CURRENT_DATE - due_date > 90), 0) as ninety_amount
     FROM invoices
     WHERE user_id = $1 AND status IN ('sent', 'overdue')`,
    [userId]
  );

  const row = result.rows[0];
  return {
    current: parseInt(row.current_count, 10),
    thirtyDay: parseInt(row.thirty_count, 10),
    sixtyDay: parseInt(row.sixty_count, 10),
    ninetyPlus: parseInt(row.ninety_count, 10),
    currentAmount: parseInt(row.current_amount, 10),
    thirtyDayAmount: parseInt(row.thirty_amount, 10),
    sixtyDayAmount: parseInt(row.sixty_amount, 10),
    ninetyPlusAmount: parseInt(row.ninety_amount, 10),
  };
}

/**
 * Get top 5 customers by paid revenue
 */
async function getTopCustomers(userId: string): Promise<TopCustomer[]> {
  const result = await db.query<{
    customer_id: string;
    customer_name: string;
    revenue: string;
    invoice_count: string;
  }>(
    `SELECT
      i.customer_id,
      COALESCE(c.name, i.client_name, 'Unknown') as customer_name,
      SUM(i.total) as revenue,
      COUNT(*) as invoice_count
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id AND c.user_id = $1
     WHERE i.user_id = $1 AND i.status = 'paid'
     GROUP BY i.customer_id, c.name, i.client_name
     ORDER BY revenue DESC
     LIMIT 5`,
    [userId]
  );

  return result.rows.map(row => ({
    customerId: row.customer_id || '',
    customerName: row.customer_name,
    revenue: parseInt(row.revenue, 10),
    invoiceCount: parseInt(row.invoice_count, 10),
  }));
}

/**
 * Get monthly revenue for the last 6 months
 */
async function getMonthlyRevenue(userId: string): Promise<MonthlyRevenue[]> {
  const result = await db.query<{
    month: string;
    revenue: string;
    count: string;
  }>(
    `SELECT
      to_char(date_trunc('month', paid_at), 'YYYY-MM') as month,
      COALESCE(SUM(total), 0) as revenue,
      COUNT(*) as count
     FROM invoices
     WHERE user_id = $1
       AND status = 'paid'
       AND paid_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
     GROUP BY date_trunc('month', paid_at)
     ORDER BY month ASC`,
    [userId]
  );

  // Build full 6-month array (fill in missing months with 0)
  const months: MonthlyRevenue[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = monthNames[d.getMonth()];
    const existing = result.rows.find(r => r.month === key);

    months.push({
      month: key,
      label,
      revenue: existing ? parseInt(existing.revenue, 10) : 0,
      count: existing ? parseInt(existing.count, 10) : 0,
    });
  }

  return months;
}

/**
 * Get all insights data
 */
async function getInsights(userId: string): Promise<InsightsData> {
  const [revenue, aging, topCustomers, monthlyRevenue] = await Promise.all([
    getRevenueComparison(userId),
    getInvoiceAging(userId),
    getTopCustomers(userId),
    getMonthlyRevenue(userId),
  ]);

  return { revenue, aging, topCustomers, monthlyRevenue };
}

export default {
  getRevenueComparison,
  getInvoiceAging,
  getTopCustomers,
  getMonthlyRevenue,
  getInsights,
};
