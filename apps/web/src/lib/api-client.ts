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
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = options;

  const res = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

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
    clientFetch('/api/auth/login', { method: 'POST', body: { email, password } }),

  register: (data: { email: string; password: string; name?: string }) =>
    clientFetch('/api/auth/register', { method: 'POST', body: data }),

  logout: () =>
    clientFetch('/api/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    clientFetch('/api/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    clientFetch('/api/auth/reset-password', { method: 'POST', body: data }),

  me: () =>
    clientFetch<{ user: import('@bossboard/shared').User }>('/api/auth/me'),
};

/** Invoices API — full CRUD + send/email/PDF/paid actions. */
export interface InvoiceLineItemInput {
  /** Line description shown on invoice */
  description: string;
  /** Amount in cents (integer). $5.99 → 599. */
  amount: number;
}

export interface CreateInvoiceInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  jobDescription?: string;
  lineItems: InvoiceLineItemInput[];
  includeGst?: boolean;
  /** ISO date string (YYYY-MM-DD) */
  dueDate?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  notes?: string;
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
    deepCamelize<InvoiceEnvelope & { messageId?: string }>(
      await clientFetch<unknown>(`/api/invoices/${id}/email`, {
        method: 'POST',
        body: data,
      }),
    ),

  share: (id: string) =>
    clientFetch<{ shareToken: string; shareUrl: string }>(
      `/api/invoices/${id}/share`,
      { method: 'POST' },
    ),

  /** Returns the absolute URL for the PDF download endpoint. The browser
   *  fetches the PDF directly via this URL so it triggers the native
   *  download/print dialog rather than reading bytes through fetch(). */
  pdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
};

/** Quotes API (read-only first ship — list + detail + convert-to-invoice).
 *  Create / edit / send live in the BossBoard mobile app for v1. */
export const quotesClient = {
  list: () =>
    clientFetch<{ quotes: import('@bossboard/shared').Quote[] }>('/api/quotes'),

  get: (id: string) =>
    clientFetch<{ quote: import('@bossboard/shared').Quote }>(`/api/quotes/${id}`),

  convert: (id: string) =>
    clientFetch<{ invoice: import('@bossboard/shared').Invoice }>(
      `/api/quotes/${id}/convert`,
      { method: 'POST' },
    ),
};

/** Certifications API (v1 read-only — list. Add / edit / delete in mobile). */
export const certificationsClient = {
  list: () =>
    clientFetch<{ certifications: import('@bossboard/shared').Certification[] }>(
      '/api/certifications',
    ),
};

/** Expenses API (v1 read-only). Receipts + create/edit live in mobile. */
export const expensesClient = {
  list: () =>
    clientFetch<{ expenses: import('@bossboard/shared').Expense[] }>('/api/expenses'),
};

/** Job logs API (v1 read-only). Clock in/out lives in mobile. */
export const jobLogsClient = {
  list: (params?: { status?: 'active' | 'completed' }) => {
    const qs = params?.status ? `?status=${params.status}` : '';
    return clientFetch<{ jobLogs: import('@bossboard/shared').JobLog[] }>(
      `/api/job-logs${qs}`,
    );
  },
};

/** SWMS API (v1 read-only list). Generation, signing, photos, PDF
 *  download all live in the BossBoard mobile app — those are
 *  on-site / signature-pad workflows that don't translate to a
 *  desktop web view. */
export const swmsClient = {
  list: () =>
    clientFetch<{ documents: import('@bossboard/shared').SWMSDocument[] }>('/api/swms'),
};

/** Teams API (v1 web scope: view team + invite members + cancel invites).
 *  Remove member, change role, leave team, create team are mobile-only
 *  for now — bigger UX considerations than this v1 covers. */
export const teamsClient = {
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
