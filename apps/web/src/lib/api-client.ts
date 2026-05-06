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

/** Invoices API (read-only first ship — list + detail + share link).
 *  Send / email / PDF actions are intentionally out of scope for the v1
 *  web view; tradies do those flows in the BossBoard mobile app. */
export const invoicesClient = {
  list: () =>
    clientFetch<{ invoices: import('@bossboard/shared').Invoice[] }>('/api/invoices'),

  get: (id: string) =>
    clientFetch<{ invoice: import('@bossboard/shared').Invoice }>(`/api/invoices/${id}`),

  share: (id: string) =>
    clientFetch<{ shareToken: string; shareUrl: string }>(
      `/api/invoices/${id}/share`,
      { method: 'POST' },
    ),
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

/** Stats API (v1 read-only dashboard aggregation). */
export const statsClient = {
  dashboard: () =>
    clientFetch<{ stats: import('@bossboard/shared').DashboardStats }>('/api/stats/dashboard'),
};
