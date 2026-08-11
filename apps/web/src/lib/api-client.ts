/**
 * Client-side API client.
 * Calls Next.js API routes (which proxy to Express).
 * Used in client components — tokens never touch the browser.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function clientFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
  _retried = false,
): Promise<T> {
  const { method = 'GET', body, timeoutMs = 25_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'Request timed out. Check your connection and try again.');
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Network error — could not reach BossBoard. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  let json: { success?: boolean; error?: string; message?: string; data?: unknown } = {};
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new ApiError(
        res.status,
        'INVALID_RESPONSE',
        res.ok ? 'Unexpected response from server' : `Request failed (${res.status})`,
      );
    }
  }

  // Access cookie is 15m; refresh is 7d. One silent refresh + retry for idle forms.
  if (
    !_retried &&
    res.status === 401 &&
    endpoint !== '/api/auth/refresh' &&
    endpoint !== '/api/auth/login' &&
    (json.error === 'NOT_AUTHENTICATED' ||
      json.message === 'No session' ||
      json.error === 'TOKEN_EXPIRED')
  ) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (refreshRes.ok) {
      return clientFetch<T>(endpoint, options, true);
    }
  }

  if (!res.ok || !json.success) {
    throw new ApiError(
      res.status,
      json.error || 'UNKNOWN_ERROR',
      json.message || 'An error occurred',
    );
  }

  return json.data as T;
}

/** Auth API (calls Next.js proxy routes, not Express directly) */
export const authClient = {
  login: (email: string, password: string) =>
    clientFetch<{ user: import('@bossboard/shared').User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  register: (data: {
    email: string;
    password: string;
    name?: string;
    referralCode?: string;
  }) =>
    clientFetch<{ user: import('@bossboard/shared').User }>('/api/auth/register', {
      method: 'POST',
      body: data,
    }),

  logout: () =>
    clientFetch('/api/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    clientFetch('/api/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    clientFetch('/api/auth/reset-password', { method: 'POST', body: data }),

  me: () =>
    clientFetch<{ user: import('@bossboard/shared').User }>('/api/auth/me'),

  updateMe: (data: {
    name?: string;
    phone?: string;
    tradeType?: import('@bossboard/shared').TradeType;
    businessName?: string;
  }) =>
    clientFetch<{ user: import('@bossboard/shared').User }>('/api/auth/me', {
      method: 'PUT',
      body: data,
    }),
};

/** Invoices API — full CRUD + send/email/PDF/paid actions. */
export interface InvoiceLineItemInput {
  /** Line description shown on invoice */
  description: string;
  /** Sell amount in cents (customer-facing). $5.99 → 599. */
  amount: number;
  /** Cost attributed to this invoice (cents) — internal only. Annual → monthly share. */
  cost?: number | null;
  /** Markup % on cost — internal only */
  marginPercent?: number | null;
  /** True when cost came from an annual total */
  costIsAnnual?: boolean | null;
  /** Full annual cost cents when costIsAnnual */
  annualCost?: number | null;
}

export type InvoiceDiscountType = 'none' | 'fixed' | 'percent';

export interface CreateInvoiceInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  jobDescription?: string;
  lineItems: InvoiceLineItemInput[];
  includeGst?: boolean;
  /** none | fixed (cents) | percent (0–100) — applied before GST */
  discountType?: InvoiceDiscountType;
  /** Cents if fixed; whole percent if percent */
  discountValue?: number;
  /** Optional label on PDF / detail */
  discountLabel?: string | null;
  /** ISO date string (YYYY-MM-DD) */
  dueDate?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  notes?: string;
  /** Linked customer record from picker */
  customerId?: string | null;
  /** Staff-only — never on PDF/email/share */
  internalMemo?: string;
}

// The Express API runs invoice/quote/expense/job-log/etc responses
// through transformForMobile() which renames every field to snake_case
// for the React Native client. The shared TypeScript Invoice type is
// camelCase though, so anything the web reads needs to be normalized
// before it hits the typed view layer.
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function deepCamelize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => deepCamelize(v)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as object).constructor === Object
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamelKey(k)] = deepCamelize(v);
    }
    return out as T;
  }
  return value as T;
}

type InvoiceEnvelope = { invoice: import('@bossboard/shared').Invoice };
type InvoiceListEnvelope = { invoices: import('@bossboard/shared').Invoice[] };

export const invoicesClient = {
  list: async () =>
    deepCamelize<InvoiceListEnvelope>(
      await clientFetch<unknown>('/api/invoices'),
    ),

  get: async (id: string) =>
    deepCamelize<InvoiceEnvelope>(
      await clientFetch<unknown>(`/api/invoices/${id}`),
    ),

  create: async (data: CreateInvoiceInput) =>
    deepCamelize<InvoiceEnvelope>(
      await clientFetch<unknown>('/api/invoices', { method: 'POST', body: data }),
    ),

  update: async (id: string, data: Partial<CreateInvoiceInput>) =>
    deepCamelize<InvoiceEnvelope>(
      await clientFetch<unknown>(`/api/invoices/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/invoices/${id}`, { method: 'DELETE' }),

  markSent: async (id: string) =>
    deepCamelize<InvoiceEnvelope>(
      await clientFetch<unknown>(`/api/invoices/${id}/send`, { method: 'POST' }),
    ),

  markPaid: async (id: string) =>
    deepCamelize<InvoiceEnvelope>(
      await clientFetch<unknown>(`/api/invoices/${id}/paid`, { method: 'POST' }),
    ),

  email: async (id: string, data: { recipientEmail: string; customMessage?: string }) =>
    deepCamelize<InvoiceEnvelope & { messageId?: string; bccEmail?: string | null }>(
      await clientFetch<unknown>(`/api/invoices/${id}/email`, {
        method: 'POST',
        body: data,
      }),
    ),

  share: (id: string) =>
    clientFetch<{
      shareToken?: string;
      token?: string;
      shareUrl: string;
      invoice?: import('@bossboard/shared').Invoice;
    }>(`/api/invoices/${id}/share`, { method: 'POST' }),

  /** Returns the absolute URL for the PDF download endpoint. The browser
   *  fetches the PDF directly via this URL so it triggers the native
   *  download/print dialog rather than reading bytes through fetch(). */
  pdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
};

/** Quotes API — list + detail + convert + full create/edit.
 *  All reads are deepCamelize-normalized (Express returns snake_case). */
export interface CreateQuoteInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  customerId?: string;
  jobDescription?: string;
  lineItems: InvoiceLineItemInput[];
  includeGst?: boolean;
  /** ISO date string (YYYY-MM-DD) */
  validUntil?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  notes?: string;
  /** Staff-only — never on quote PDF */
  internalMemo?: string;
}
export type UpdateQuoteInput = Partial<CreateQuoteInput>;

type QuoteEnvelope = { quote: import('@bossboard/shared').Quote };
type QuoteListEnvelope = { quotes: import('@bossboard/shared').Quote[] };

export type BusinessProfileUpdate = {
  companyName?: string;
  tradingAs?: string;
  irdNumber?: string;
  gstNumber?: string;
  isGstRegistered?: boolean;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  /** Optional BCC for invoice emails (business mailbox). Falls back to companyEmail then account email. */
  invoiceBccEmail?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  intlBankAccountName?: string;
  intlIban?: string;
  intlSwiftBic?: string;
  intlBankName?: string;
  intlBankAddress?: string;
  intlRoutingNumber?: string;
  defaultPaymentTerms?: number;
  defaultNotes?: string;
  invoicePrefix?: string;
};

export const businessProfileClient = {
  get: async () =>
    deepCamelize<{ profile: import('@bossboard/shared').BusinessProfile | null }>(
      await clientFetch<unknown>('/api/business-profile'),
    ),

  update: async (data: BusinessProfileUpdate) =>
    deepCamelize<{ profile: import('@bossboard/shared').BusinessProfile }>(
      await clientFetch<unknown>('/api/business-profile', { method: 'PUT', body: data }),
    ),
};

export const recurringInvoicesClient = {
  list: async () =>
    deepCamelize<{
      recurringInvoices: import('@bossboard/shared').RecurringInvoice[];
      total?: number;
    }>(await clientFetch<unknown>('/api/recurring-invoices')),

  pending: async () =>
    deepCamelize<{
      autoGenerate?: unknown[];
      needsInput?: unknown[];
      pending?: unknown[];
    }>(await clientFetch<unknown>('/api/recurring-invoices/pending')),

  create: async (data: {
    customerId: string;
    name: string;
    dayOfMonth?: number;
    includeGst?: boolean;
    paymentTerms?: number;
    notes?: string;
    lineItems: {
      productServiceId: string;
      description?: string;
      unitPrice: number;
      quantity?: number;
      type: 'fixed' | 'variable';
    }[];
  }) =>
    deepCamelize<{ recurringInvoice: import('@bossboard/shared').RecurringInvoice }>(
      await clientFetch<unknown>('/api/recurring-invoices', { method: 'POST', body: data }),
    ),

  generate: async (id: string, variableAmounts?: Record<string, number>) =>
    deepCamelize<{ invoice: import('@bossboard/shared').Invoice }>(
      await clientFetch<unknown>(`/api/recurring-invoices/${id}/generate`, {
        method: 'POST',
        body: variableAmounts ? { variableAmounts } : {},
      }),
    ),

  /** Create a monthly template from an existing invoice (needs linked customer). */
  fromInvoice: async (
    invoiceId: string,
    data?: {
      name?: string;
      dayOfMonth?: number;
      includeGst?: boolean;
      paymentTerms?: number;
      notes?: string;
    },
  ) =>
    deepCamelize<{ recurring: import('@bossboard/shared').RecurringInvoice }>(
      await clientFetch<unknown>(
        `/api/recurring-invoices/from-invoice/${invoiceId}`,
        { method: 'POST', body: data || {} },
      ),
    ),

  remove: (id: string) =>
    clientFetch(`/api/recurring-invoices/${id}`, { method: 'DELETE' }),
};

export const quotesClient = {
  list: async () =>
    deepCamelize<QuoteListEnvelope>(await clientFetch<unknown>('/api/quotes')),

  get: async (id: string) =>
    deepCamelize<QuoteEnvelope>(await clientFetch<unknown>(`/api/quotes/${id}`)),

  create: async (data: CreateQuoteInput) =>
    deepCamelize<QuoteEnvelope>(
      await clientFetch<unknown>('/api/quotes', { method: 'POST', body: data }),
    ),

  update: async (id: string, data: UpdateQuoteInput) =>
    deepCamelize<QuoteEnvelope>(
      await clientFetch<unknown>(`/api/quotes/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/quotes/${id}`, { method: 'DELETE' }),

  convert: async (id: string) =>
    deepCamelize<{ invoice: import('@bossboard/shared').Invoice }>(
      await clientFetch<unknown>(`/api/quotes/${id}/convert`, { method: 'POST' }),
    ),

  /** Absolute URL for the quote PDF download endpoint. */
  pdfUrl: (id: string) => `/api/quotes/${id}/pdf`,
};

/** Bank CSV import + invoice reconciliation (amounts in integer cents). */
export type BankSummary = {
  total: number;
  reconciled: number;
  unreconciled: number;
  totalCredits: number;
  totalDebits: number;
};

export const bankTransactionsClient = {
  list: async (params?: { isReconciled?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.isReconciled === true) sp.set('isReconciled', 'true');
    if (params?.isReconciled === false) sp.set('isReconciled', 'false');
    const qs = sp.toString();
    return deepCamelize<{
      transactions: import('@bossboard/shared').BankTransaction[];
      total?: number;
    }>(await clientFetch<unknown>(`/api/bank-transactions${qs ? `?${qs}` : ''}`));
  },

  summary: async () =>
    deepCamelize<{ summary: BankSummary }>(
      await clientFetch<unknown>('/api/bank-transactions/summary'),
    ),

  /** csvContent may be plain CSV text or base64 (API accepts both). */
  upload: async (csvContent: string, filename: string) =>
    deepCamelize<{ imported: number; duplicates: number; batchId?: string }>(
      await clientFetch<unknown>('/api/bank-transactions/upload', {
        method: 'POST',
        body: { csvContent, filename },
      }),
    ),

  autoMatch: async () =>
    deepCamelize<{ matched: number }>(
      await clientFetch<unknown>('/api/bank-transactions/auto-match', { method: 'POST' }),
    ),

  confirm: async (id: string) =>
    deepCamelize<{ transaction: import('@bossboard/shared').BankTransaction }>(
      await clientFetch<unknown>(`/api/bank-transactions/${id}/confirm`, { method: 'POST' }),
    ),

  unmatch: async (id: string) =>
    deepCamelize<{ transaction: import('@bossboard/shared').BankTransaction }>(
      await clientFetch<unknown>(`/api/bank-transactions/${id}/unmatch`, { method: 'POST' }),
    ),
};

/** Certifications API — list + full create/edit/delete. */
export type CertificationType =
  | 'electrical' | 'gas' | 'plumbing' | 'lpg' | 'first_aid' | 'site_safe' | 'other';

export interface CreateCertificationInput {
  type: CertificationType;
  name: string;
  certNumber?: string;
  issuingBody?: string;
  /** ISO date string (YYYY-MM-DD) */
  issueDate?: string;
  /** ISO date string (YYYY-MM-DD) */
  expiryDate?: string;
}
export type UpdateCertificationInput = Partial<CreateCertificationInput>;

type CertEnvelope = { certification: import('@bossboard/shared').Certification };
type CertListEnvelope = { certifications: import('@bossboard/shared').Certification[] };

export const certificationsClient = {
  list: async () =>
    deepCamelize<CertListEnvelope>(await clientFetch<unknown>('/api/certifications')),

  get: async (id: string) =>
    deepCamelize<CertEnvelope>(await clientFetch<unknown>(`/api/certifications/${id}`)),

  create: async (data: CreateCertificationInput) =>
    deepCamelize<CertEnvelope>(
      await clientFetch<unknown>('/api/certifications', { method: 'POST', body: data }),
    ),

  update: async (id: string, data: UpdateCertificationInput) =>
    deepCamelize<CertEnvelope>(
      await clientFetch<unknown>(`/api/certifications/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/certifications/${id}`, { method: 'DELETE' }),
};

/** Expenses API — list + full create/edit/delete. */
export type ExpenseCategory =
  | 'materials' | 'fuel' | 'tools' | 'subcontractor' | 'vehicle' | 'office' | 'other';

export interface CreateExpenseInput {
  /** Amount in cents (integer). $5.99 → 599. */
  amount: number;
  category: ExpenseCategory;
  /** ISO date string (YYYY-MM-DD) */
  date?: string;
  description?: string;
  vendor?: string;
  isGstClaimable?: boolean;
  notes?: string;
}
export type UpdateExpenseInput = Partial<CreateExpenseInput>;

type ExpenseEnvelope = { expense: import('@bossboard/shared').Expense };
type ExpenseListEnvelope = { expenses: import('@bossboard/shared').Expense[] };

export const expensesClient = {
  list: async () =>
    deepCamelize<ExpenseListEnvelope>(await clientFetch<unknown>('/api/expenses')),

  get: async (id: string) =>
    deepCamelize<ExpenseEnvelope>(await clientFetch<unknown>(`/api/expenses/${id}`)),

  create: async (data: CreateExpenseInput) =>
    deepCamelize<ExpenseEnvelope>(
      await clientFetch<unknown>('/api/expenses', { method: 'POST', body: data }),
    ),

  update: async (id: string, data: UpdateExpenseInput) =>
    deepCamelize<ExpenseEnvelope>(
      await clientFetch<unknown>(`/api/expenses/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/expenses/${id}`, { method: 'DELETE' }),
};

/** Job logs API — list + clock in (create) / clock out / edit / active. */
export interface CreateJobLogInput {
  description: string;
  siteAddress?: string;
  customerId?: string;
  /** ISO datetime; defaults to now server-side when omitted */
  startTime?: string;
  notes?: string;
}
export interface UpdateJobLogInput {
  description?: string;
  siteAddress?: string;
  customerId?: string | null;
  notes?: string;
}

type JobLogEnvelope = { jobLog: import('@bossboard/shared').JobLog };
type JobLogListEnvelope = { jobLogs: import('@bossboard/shared').JobLog[] };

export const jobLogsClient = {
  list: async (params?: { status?: 'active' | 'completed' }) => {
    const qs = params?.status ? `?status=${params.status}` : '';
    return deepCamelize<JobLogListEnvelope>(
      await clientFetch<unknown>(`/api/job-logs${qs}`),
    );
  },

  /** The currently clocked-in job, or { jobLog: null }. */
  getActive: async () =>
    deepCamelize<{ jobLog: import('@bossboard/shared').JobLog | null }>(
      await clientFetch<unknown>('/api/job-logs/active'),
    ),

  /** Clock in (start a job log). */
  create: async (data: CreateJobLogInput) =>
    deepCamelize<JobLogEnvelope>(
      await clientFetch<unknown>('/api/job-logs', { method: 'POST', body: data }),
    ),

  clockOut: async (id: string, data: { notes?: string } = {}) =>
    deepCamelize<JobLogEnvelope>(
      await clientFetch<unknown>(`/api/job-logs/${id}/clock-out`, {
        method: 'POST',
        body: data,
      }),
    ),

  update: async (id: string, data: UpdateJobLogInput) =>
    deepCamelize<JobLogEnvelope>(
      await clientFetch<unknown>(`/api/job-logs/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/job-logs/${id}`, { method: 'DELETE' }),
};

/** SWMS API — list + AI generation + detail + templates. */
type SWMSGenerateResult = {
  swmsId: string;
  document: Partial<import('@bossboard/shared').SWMSDocument>;
  suggestedHazards: import('@bossboard/shared').Hazard[];
  suggestedControls: import('@bossboard/shared').Control[];
  template: import('@bossboard/shared').SWMSTemplate;
};

export const swmsClient = {
  list: async () =>
    deepCamelize<{ documents: import('@bossboard/shared').SWMSDocument[] }>(
      await clientFetch<unknown>('/api/swms'),
    ),

  get: async (id: string) =>
    deepCamelize<{ document: import('@bossboard/shared').SWMSDocument }>(
      await clientFetch<unknown>(`/api/swms/${id}`),
    ),

  /** AI-generate a SWMS document. Slow (AI call) — show a loading state. */
  generate: async (data: import('@bossboard/shared').SWMSGenerateInput) =>
    deepCamelize<SWMSGenerateResult>(
      await clientFetch<unknown>('/api/swms/generate', { method: 'POST', body: data }),
    ),

  listTemplates: () =>
    clientFetch<{ templates: import('@bossboard/shared').SWMSTemplate[] }>(
      '/api/swms/templates',
    ),

  /** Absolute URL for the SWMS PDF download endpoint (browser fetches directly). */
  pdfUrl: (id: string) => `/api/swms/${id}/pdf`,
};

/** Photos API — universal attachments. Upload is multipart/form-data, so it
 *  cannot use clientFetch (which is JSON-only); it uses a bare fetch + FormData
 *  and lets the browser set the multipart boundary. */
export const photosClient = {
  upload: async (
    file: File,
    entityType: import('@bossboard/shared').PhotoEntityType,
    entityId: string,
    caption?: string,
  ) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    if (caption) fd.append('caption', caption);

    const res = await fetch('/api/photos', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new ApiError(
        res.status,
        json.error || 'UNKNOWN_ERROR',
        json.message || 'Upload failed',
      );
    }
    return deepCamelize<{ photo: import('@bossboard/shared').Photo }>(json.data);
  },

  listByEntity: async (
    entityType: import('@bossboard/shared').PhotoEntityType,
    entityId: string,
  ) =>
    deepCamelize<{ photos: import('@bossboard/shared').Photo[] }>(
      await clientFetch<unknown>(`/api/photos/entity/${entityType}/${entityId}`),
    ),

  remove: (id: string) =>
    clientFetch<{ ok: true }>(`/api/photos/${id}`, { method: 'DELETE' }),

  /** Absolute URL for the raw image bytes — use as <img src>. */
  fileUrl: (id: string) => `/api/photos/${id}/file`,
};

/** Teams API — create, view, invite, remove/role/leave. */
export const teamsClient = {
  create: (data: { name: string }) =>
    clientFetch<{
      team: import('@bossboard/shared').Team;
      membership?: import('@bossboard/shared').TeamMember;
    }>('/api/teams', { method: 'POST', body: data }),

  myTeam: () =>
    clientFetch<{
      team: import('@bossboard/shared').Team | null;
      role: import('@bossboard/shared').TeamRole | null;
      members: import('@bossboard/shared').TeamMember[];
    }>('/api/teams/my-team'),

  listInvites: (teamId: string) =>
    clientFetch<{ invites: import('@bossboard/shared').TeamInvite[] }>(
      `/api/teams/${teamId}/invites`,
    ),

  invite: (teamId: string, data: { email: string; role?: import('@bossboard/shared').TeamRole }) =>
    clientFetch<{ invite: import('@bossboard/shared').TeamInvite }>(
      `/api/teams/${teamId}/invites`,
      { method: 'POST', body: data },
    ),

  cancelInvite: (teamId: string, inviteId: string) =>
    clientFetch<{ ok: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`, {
      method: 'DELETE',
    }),

  /** Remove a team member. Owner removes any non-owner; admin removes
   *  workers only. `memberUserId` is the target user id, not the row id. */
  removeMember: (teamId: string, memberUserId: string) =>
    clientFetch<{ ok: boolean }>(
      `/api/teams/${teamId}/members/${memberUserId}`,
      { method: 'DELETE' },
    ),

  /** Update a member's role. Owner only — admins cannot promote/demote.
   *  Backend rejects assigning `owner` (ownership transfer is separate). */
  updateMemberRole: (
    teamId: string,
    memberUserId: string,
    role: Exclude<import('@bossboard/shared').TeamRole, 'owner'>,
  ) =>
    clientFetch<{ member: import('@bossboard/shared').TeamMember }>(
      `/api/teams/${teamId}/members/${memberUserId}/role`,
      { method: 'PUT', body: { role } },
    ),

  /** Leave the team. Owner cannot leave — backend returns 400. */
  leaveTeam: (teamId: string) =>
    clientFetch<{ ok: boolean }>(`/api/teams/${teamId}/leave`, {
      method: 'POST',
    }),
};

/** Stats API — dashboard counts surfaced on /dashboard.
 *  Read-only summary; underlying entities (invoices, quotes, etc.)
 *  have their own dedicated endpoints for detail views. */
export const statsClient = {
  dashboard: () =>
    clientFetch<{ stats: import('@bossboard/shared').DashboardStats }>(
      '/api/stats/dashboard',
    ),
};

/** Getting started — first-invoice checklist + product tour flags. */
export const gettingStartedClient = {
  status: () =>
    clientFetch<import('@bossboard/shared').GettingStartedStatus>(
      '/api/getting-started',
    ),

  completeTour: () =>
    clientFetch<import('@bossboard/shared').GettingStartedStatus>(
      '/api/getting-started/tour-complete',
      { method: 'POST' },
    ),

  dismiss: () =>
    clientFetch<import('@bossboard/shared').GettingStartedStatus>(
      '/api/getting-started/dismiss',
      { method: 'POST' },
    ),

  reopen: (resetTour = false) =>
    clientFetch<import('@bossboard/shared').GettingStartedStatus>(
      '/api/getting-started/reopen',
      { method: 'POST', body: { resetTour } },
    ),
};

/** Subscriptions API (read-only).
 *  Plan changes / Stripe checkout still happen in the mobile app. */
export const subscriptionsClient = {
  me: () =>
    clientFetch<{ subscription: import('@bossboard/shared').SubscriptionInfo }>(
      '/api/subscriptions/me',
    ),

  usage: () =>
    clientFetch<{ usage: import('@bossboard/shared').TierUsage }>('/api/subscriptions/usage'),

  limits: () =>
    clientFetch<{ limits: import('@bossboard/shared').TierLimits }>(
      '/api/subscriptions/limits',
    ),
};

export type CustomerCreateInput = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  defaultPaymentTerms?: number;
  defaultIncludeGst?: boolean;
};

export type ProductCreateInput = {
  name: string;
  description?: string;
  /** Sell unit price in cents */
  unitPrice: number;
  /** Direct cost cents (internal). Full year if unitCostIsAnnual. */
  unitCost?: number | null;
  /** When true, unitCost is yearly; invoices use unitCost/12 for P&L */
  unitCostIsAnnual?: boolean;
  /** Default margin % on cost */
  defaultMarginPercent?: number | null;
  type?: 'fixed' | 'variable';
  isGstApplicable?: boolean;
};

/** Customers catalog — list/create/update/deactivate */
export const customersClient = {
  list: async (opts?: { search?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.search) qs.set('search', opts.search);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return deepCamelize<{ customers: import('@bossboard/shared').Customer[]; total: number }>(
      await clientFetch<unknown>(`/api/customers${q ? `?${q}` : ''}`),
    );
  },

  get: async (id: string) =>
    deepCamelize<{ customer: import('@bossboard/shared').Customer }>(
      await clientFetch<unknown>(`/api/customers/${id}`),
    ),

  create: async (data: CustomerCreateInput) =>
    deepCamelize<{ customer: import('@bossboard/shared').Customer }>(
      await clientFetch<unknown>('/api/customers', { method: 'POST', body: data }),
    ),

  update: async (id: string, data: Partial<CustomerCreateInput> & { isActive?: boolean }) =>
    deepCamelize<{ customer: import('@bossboard/shared').Customer }>(
      await clientFetch<unknown>(`/api/customers/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok?: boolean }>(`/api/customers/${id}`, { method: 'DELETE' }),
};

/** Products/services catalog — list/create/update/deactivate */
export const productsClient = {
  list: async (opts?: { search?: string; limit?: number; type?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.search) qs.set('search', opts.search);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.type) qs.set('type', opts.type);
    const q = qs.toString();
    return deepCamelize<{
      products: import('@bossboard/shared').ProductService[];
      total: number;
    }>(await clientFetch<unknown>(`/api/products${q ? `?${q}` : ''}`));
  },

  get: async (id: string) =>
    deepCamelize<{ product: import('@bossboard/shared').ProductService }>(
      await clientFetch<unknown>(`/api/products/${id}`),
    ),

  create: async (data: ProductCreateInput) =>
    deepCamelize<{ product: import('@bossboard/shared').ProductService }>(
      await clientFetch<unknown>('/api/products', { method: 'POST', body: data }),
    ),

  update: async (
    id: string,
    data: Partial<ProductCreateInput> & { isActive?: boolean },
  ) =>
    deepCamelize<{ product: import('@bossboard/shared').ProductService }>(
      await clientFetch<unknown>(`/api/products/${id}`, { method: 'PUT', body: data }),
    ),

  remove: (id: string) =>
    clientFetch<{ ok?: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
};

/** SaaS friend referral + free-month balance */
export const referralsClient = {
  me: () =>
    clientFetch<{
      eligible: boolean;
      code: string | null;
      shareUrl: string | null;
      freeMonthsBalance: number;
      pendingReferralCode: string | null;
      stats: { pending: number; activated: number };
      offerCopy: string;
    }>('/api/referrals/me'),

  attach: (code: string) =>
    clientFetch<{ code: string; status: string }>('/api/referrals/attach', {
      method: 'POST',
      body: { code },
    }),
};

/** Feedback API — Lane A in-app capture (bug / idea / other). */
export const feedbackClient = {
  submit: (data: import('@bossboard/shared').FeedbackCreateInput) =>
    clientFetch<{ feedback: import('@bossboard/shared').FeedbackItem }>('/api/feedback', {
      method: 'POST',
      body: data,
    }),
};
