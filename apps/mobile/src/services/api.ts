/**
 * API Service
 * Handles all HTTP requests to the BossBoard API
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Get API URL from environment variable (set via eas.json per build profile)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
  || Constants.expoConfig?.extra?.apiUrl
  || 'http://localhost:29000';

const REFRESH_KEY = 'bossboard_refresh_token';
const TOKEN_KEY = 'bossboard_access_token';

let authToken: string | null = null;
/** Prevent parallel 401s from stampeding refresh */
let refreshInFlight: Promise<boolean> | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Silent access-token refresh (used when API returns 401 Token expired).
 * Mirrors web BFF refresh so invoice detail doesn't fail mid-session.
 */
async function trySilentRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) return false;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'BossBoardMobile/0.5.0',
        },
        body: JSON.stringify({ refreshToken }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { tokens?: { accessToken?: string; refreshToken?: string } };
      };
      if (!res.ok || !json.success || !json.data?.tokens?.accessToken) {
        return false;
      }
      const { accessToken, refreshToken: newRefresh } = json.data.tokens;
      authToken = accessToken;
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      if (newRefresh) {
        await SecureStore.setItemAsync(REFRESH_KEY, newRefresh);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipRetryOn?: number[]; // HTTP status codes to not retry
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
}

// Network error types for better handling
export class NetworkError extends Error {
  constructor(message: string, public code: string = 'NETWORK_ERROR') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = 'API_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Request deduplication cache
const requestCache = new Map<string, Promise<ApiResponse<unknown>>>();

/**
 * Creates a timeout promise that rejects after the specified duration
 */
function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError()), timeoutMs);
  });
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown, skipRetryOn: number[] = []): boolean {
  // Network errors (offline, timeout) are retryable
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return true;
  }

  // Server errors (5xx) are retryable, client errors (4xx) usually aren't
  if (error instanceof ApiError) {
    if (skipRetryOn.includes(error.status)) {
      return false;
    }
    return error.status >= 500 && error.status < 600;
  }

  return false;
}

/**
 * Calculates exponential backoff delay with jitter
 */
function calculateRetryDelay(attempt: number, baseDelay: number = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, 30000); // Max 30s
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate cache key for request deduplication
 */
function getCacheKey(endpoint: string, method: string, body?: unknown): string {
  return `${method}:${endpoint}:${body ? JSON.stringify(body) : ''}`;
}

async function request<T = any>(
  endpoint: string,
  config: RequestConfig = {},
  _didRefresh = false,
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = 30000, // 30s default timeout
    retries = 3,
    retryDelay = 1000,
    skipRetryOn = [400, 401, 403, 404, 422], // Don't retry client errors
  } = config;

  // Request deduplication for GET requests
  const cacheKey = method === 'GET' ? getCacheKey(endpoint, method, body) : null;
  if (cacheKey && requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as Promise<ApiResponse<T>>;
  }

  let lastError: unknown;

  const executeRequest = async (): Promise<ApiResponse<T>> => {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      // Explicit UA — some edge/WAF configs are harsh on empty/Python-like signatures
      'User-Agent': 'BossBoardMobile/0.5.0',
      Accept: 'application/json',
      ...headers,
    };

    if (authToken) {
      requestHeaders['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      // Create fetch promise with timeout
      const fetchPromise = fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Race between fetch and timeout
      const response = await Promise.race([
        fetchPromise,
        createTimeoutPromise(timeout),
      ]);

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as unknown as T;
      }

      if (!response.ok) {
        const errorData = data as unknown as { message?: string; error?: string };
        throw new ApiError(
          errorData.message || 'API request failed',
          response.status,
          errorData.error || 'UNKNOWN_ERROR'
        );
      }

      return { data, status: response.status };
    } catch (error) {
      // Classify error
      if (error instanceof TimeoutError || error instanceof ApiError) {
        throw error;
      }

      // Network/fetch errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError('Network request failed - check internet connection', 'NETWORK_ERROR');
      }

      // Unknown error
      throw new NetworkError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'UNKNOWN_ERROR'
      );
    }
  };

  // Retry logic
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resultPromise = executeRequest();

      // Cache GET requests
      if (cacheKey) {
        requestCache.set(cacheKey, resultPromise as Promise<ApiResponse<unknown>>);
      }

      const result = await resultPromise;

      // Clear cache on success
      if (cacheKey) {
        requestCache.delete(cacheKey);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Clear failed request from cache
      if (cacheKey) {
        requestCache.delete(cacheKey);
      }

      // One silent refresh + retry on expired/invalid access token (not on refresh endpoint itself)
      if (
        !_didRefresh &&
        error instanceof ApiError &&
        error.status === 401 &&
        !endpoint.includes('/auth/refresh') &&
        !endpoint.includes('/auth/login')
      ) {
        const refreshed = await trySilentRefresh();
        if (refreshed) {
          return request<T>(endpoint, config, true);
        }
      }

      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, skipRetryOn)) {
        break;
      }

      // Calculate and wait for retry delay
      const delay = calculateRetryDelay(attempt, retryDelay);
      console.log(`[API] Retry attempt ${attempt + 1}/${retries} after ${delay}ms for ${method} ${endpoint}`);
      await sleep(delay);
    }
  }

  // All retries exhausted, throw last error
  throw lastError;
}

export const api = {
  get: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', headers }),

  post: <T = any>(endpoint: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'POST', body, headers }),

  put: <T = any>(endpoint: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'PUT', body, headers }),

  delete: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'DELETE', headers }),
};

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name?: string; phone?: string; tradeType?: string; businessName?: string }) =>
    api.post('/api/v1/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/api/v1/auth/login', data),

  refreshToken: (refreshToken: string) =>
    api.post('/api/v1/auth/refresh', { refreshToken }),

  logout: (refreshToken?: string) =>
    api.post('/api/v1/auth/logout', { refreshToken }),

  getMe: () => api.get('/api/v1/auth/me'),

  updateMe: (data: { name?: string; phone?: string; tradeType?: string; businessName?: string }) =>
    api.put('/api/v1/auth/me', data),

  verifyEmail: (code: string) =>
    api.post('/api/v1/auth/verify-email', { code }),

  resendVerification: () =>
    api.post('/api/v1/auth/resend-verification'),

  completeOnboarding: () =>
    api.post('/api/v1/auth/complete-onboarding'),

  forgotPassword: (email: string) =>
    api.post('/api/v1/auth/forgot-password', { email }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post('/api/v1/auth/reset-password', { email, code, newPassword }),

  deleteAccount: () =>
    api.delete('/api/v1/auth/account'),
};

// SWMS-specific API calls
export const swmsApi = {
  getTemplates: () => api.get('/api/v1/swms/templates'),

  getTemplate: (tradeType: string) => api.get(`/api/v1/swms/templates/${tradeType}`),

  generate: (data: {
    tradeType: string;
    jobDescription: string;
    siteAddress?: string;
    clientName?: string;
    expectedDuration?: string;
    useAI?: boolean;
  }) => api.post('/api/v1/swms/generate', data),

  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/swms${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/swms/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/swms/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/swms/${id}`),

  sign: (id: string, signature: string, role: 'worker' | 'supervisor') =>
    api.post(`/api/v1/swms/${id}/sign`, { signature, role }),
};

// Invoices API
export const invoicesApi = {
  create: (data: {
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    customerId?: string;
    swmsId?: string;
    jobDescription?: string;
    lineItems: {
      description: string;
      amount: number;
      cost?: number | null;
      marginPercent?: number | null;
    }[];
    includeGst?: boolean;
    dueDate?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    intlBankAccountName?: string;
    intlIban?: string;
    intlSwiftBic?: string;
    intlBankName?: string;
    intlBankAddress?: string;
    companyName?: string;
    companyAddress?: string;
    irdNumber?: string;
    gstNumber?: string;
    notes?: string;
  }) => api.post('/api/v1/invoices', data),

  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/invoices${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/invoices/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/invoices/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/invoices/${id}`),

  markAsSent: (id: string) => api.post(`/api/v1/invoices/${id}/send`),

  markAsPaid: (id: string) => api.post(`/api/v1/invoices/${id}/paid`),

  getPdfUrl: (id: string) => `${API_BASE_URL}/api/v1/invoices/${id}/pdf`,

  emailInvoice: (id: string, recipientEmail: string, customMessage?: string) =>
    api.post(`/api/v1/invoices/${id}/email`, { recipientEmail, customMessage }),

  generateShareLink: (id: string) =>
    api.post(`/api/v1/invoices/${id}/share`),
};

// Quotes API
export const quotesApi = {
  create: (data: {
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    customerId?: string;
    jobDescription?: string;
    lineItems: {
      description: string;
      amount: number;
      cost?: number | null;
      marginPercent?: number | null;
    }[];
    includeGst?: boolean;
    validUntil?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    notes?: string;
  }) => api.post('/api/v1/quotes', data),

  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/quotes${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/quotes/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/quotes/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/quotes/${id}`),

  markAsSent: (id: string) => api.post(`/api/v1/quotes/${id}/send`),

  email: (id: string, data: { recipientEmail: string; customMessage?: string }) =>
    api.post(`/api/v1/quotes/${id}/email`, data),

  markAsAccepted: (id: string) => api.post(`/api/v1/quotes/${id}/accept`),

  markAsDeclined: (id: string) => api.post(`/api/v1/quotes/${id}/decline`),

  convertToInvoice: (id: string) => api.post(`/api/v1/quotes/${id}/convert`),

  getPdfUrl: (id: string) => `${API_BASE_URL}/api/v1/quotes/${id}/pdf`,
};

// Certifications API
export const certificationsApi = {
  create: (data: {
    type: string;
    name: string;
    certNumber?: string;
    issuingBody?: string;
    issueDate?: string;
    expiryDate?: string;
  }) => api.post('/api/v1/certifications', data),

  list: (params?: { limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/certifications${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/certifications/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/certifications/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/certifications/${id}`),

  getExpiring: (days?: number) => {
    const queryParams = days ? `?days=${days}` : '';
    return api.get(`/api/v1/certifications/expiring${queryParams}`);
  },
};

// Stats API
export const statsApi = {
  getDashboard: () => api.get('/api/v1/stats/dashboard'),
  getInsights: () => api.get('/api/v1/stats/insights'),
};

// Business Profile API
export const businessProfileApi = {
  get: () => api.get('/api/v1/business-profile'),

  update: (data: {
    companyName?: string;
    tradingAs?: string;
    irdNumber?: string;
    gstNumber?: string;
    isGstRegistered?: boolean;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    /** Optional BCC for invoice emails (business mailbox) */
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
  }) => api.put('/api/v1/business-profile', data),
};

// Customers API
export const customersApi = {
  create: (data: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
    defaultPaymentTerms?: number;
    defaultIncludeGst?: boolean;
  }) => api.post('/api/v1/customers', data),

  list: (params?: { search?: string; includeInactive?: boolean; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.includeInactive) queryParams.append('includeInactive', 'true');
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/customers${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/customers/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/customers/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/customers/${id}`),
};

// Products & Services API
export const productsApi = {
  create: (data: {
    name: string;
    description?: string;
    unitPrice: number;
    unitCost?: number | null;
    defaultMarginPercent?: number | null;
    type?: 'fixed' | 'variable';
    isGstApplicable?: boolean;
  }) => api.post('/api/v1/products', data),

  list: (params?: { type?: string; search?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/products${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/products/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/products/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/products/${id}`),
};

// Recurring Invoices API
export const recurringInvoicesApi = {
  create: (data: {
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
  }) => api.post('/api/v1/recurring-invoices', data),

  list: (params?: { limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/recurring-invoices${query ? `?${query}` : ''}`);
  },

  getPending: () => api.get('/api/v1/recurring-invoices/pending'),

  get: (id: string) => api.get(`/api/v1/recurring-invoices/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/recurring-invoices/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/recurring-invoices/${id}`),

  generate: (id: string, variableAmounts?: Record<string, number>) =>
    api.post(`/api/v1/recurring-invoices/${id}/generate`, { variableAmounts }),

  getLastAmounts: (id: string) => api.get(`/api/v1/recurring-invoices/${id}/last-amounts`),
};

// Bank Transactions API
export const bankTransactionsApi = {
  upload: (csvContent: string, filename: string) =>
    api.post('/api/v1/bank-transactions/upload', { csvContent, filename }),

  list: (params?: { isReconciled?: boolean; startDate?: string; endDate?: string; batchId?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.isReconciled !== undefined) queryParams.append('isReconciled', params.isReconciled.toString());
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.batchId) queryParams.append('batchId', params.batchId);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/bank-transactions${query ? `?${query}` : ''}`);
  },

  autoMatch: () => api.post('/api/v1/bank-transactions/auto-match'),

  confirmMatch: (id: string) => api.post(`/api/v1/bank-transactions/${id}/confirm`),

  unmatch: (id: string) => api.post(`/api/v1/bank-transactions/${id}/unmatch`),

  getSummary: () => api.get('/api/v1/bank-transactions/summary'),
};

// Expenses API
export const expensesApi = {
  create: (data: {
    date?: string;
    amount: number;
    category: string;
    description?: string;
    vendor?: string;
    isGstClaimable?: boolean;
    notes?: string;
  }) => api.post('/api/v1/expenses', data),

  list: (params?: { category?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/expenses${query ? `?${query}` : ''}`);
  },

  get: (id: string) => api.get(`/api/v1/expenses/${id}`),

  update: (id: string, data: Record<string, unknown>) => api.put(`/api/v1/expenses/${id}`, data),

  delete: (id: string) => api.delete(`/api/v1/expenses/${id}`),

  getStats: () => api.get('/api/v1/expenses/stats'),

  getMonthly: (months?: number) => {
    const queryParams = months ? `?months=${months}` : '';
    return api.get(`/api/v1/expenses/monthly${queryParams}`);
  },
};

// Photos API
export const photosApi = {
  upload: async (entityType: string, entityId: string, photoUri: string, caption?: string) => {
    const formData = new FormData();
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    if (caption) formData.append('caption', caption);

    // React Native needs this format for file uploads
    const filename = photoUri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    };
    formData.append('photo', {
      uri: photoUri,
      name: filename,
      type: mimeMap[ext] || 'image/jpeg',
    } as unknown as Blob);

    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/photos`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || 'Upload failed') as Error & { status: number; code: string };
      error.status = response.status;
      error.code = data.error || 'UNKNOWN_ERROR';
      throw error;
    }
    return { data, status: response.status };
  },

  listByEntity: (entityType: string, entityId: string) =>
    api.get(`/api/v1/photos/${entityType}/${entityId}`),

  getFileUrl: (photoId: string) =>
    `${API_BASE_URL}/api/v1/photos/${photoId}/file`,

  delete: (id: string) => api.delete(`/api/v1/photos/${id}`),
};

// =============================================================================
// JOB LOGS API
// =============================================================================

export const jobLogsApi = {
  create: (data: { description: string; siteAddress?: string; customerId?: string; startTime?: string; notes?: string }) =>
    api.post('/api/v1/job-logs', data),

  list: (params?: { status?: string; customerId?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.customerId) queryParams.append('customerId', params.customerId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return api.get(`/api/v1/job-logs${query ? `?${query}` : ''}`);  
  },

  get: (id: string) => api.get(`/api/v1/job-logs/${id}`),

  getActive: () => api.get('/api/v1/job-logs/active'),

  getStats: () => api.get('/api/v1/job-logs/stats'),

  update: (id: string, data: { description?: string; siteAddress?: string; customerId?: string | null; notes?: string }) =>
    api.put(`/api/v1/job-logs/${id}`, data),

  clockOut: (id: string, notes?: string) =>
    api.post(`/api/v1/job-logs/${id}/clock-out`, { notes }),

  delete: (id: string) => api.delete(`/api/v1/job-logs/${id}`),
};

// =============================================================================
// NOTIFICATIONS API
// =============================================================================

export const notificationsApi = {
  registerPushToken: (pushToken: string) =>
    api.post('/api/v1/notifications/push-token', { pushToken }),

  removePushToken: () =>
    api.delete('/api/v1/notifications/push-token'),

  sendTest: () =>
    api.post('/api/v1/notifications/test', {}),

  checkExpiry: () =>
    api.post('/api/v1/notifications/check-expiry', {}),
};

// =============================================================================
// TEAMS API
// =============================================================================

export const teamsApi = {
  create: (data: { name: string }) =>
    api.post('/api/v1/teams', data),

  getMyTeam: () =>
    api.get('/api/v1/teams/my-team'),

  getTeam: (teamId: string) =>
    api.get(`/api/v1/teams/${teamId}`),

  updateTeam: (teamId: string, data: { name: string }) =>
    api.put(`/api/v1/teams/${teamId}`, data),

  // Members
  listMembers: (teamId: string) =>
    api.get(`/api/v1/teams/${teamId}/members`),

  removeMember: (teamId: string, memberId: string) =>
    api.delete(`/api/v1/teams/${teamId}/members/${memberId}`),

  updateMemberRole: (teamId: string, memberId: string, role: 'admin' | 'worker') =>
    api.put(`/api/v1/teams/${teamId}/members/${memberId}/role`, { role }),

  leaveTeam: (teamId: string) =>
    api.post(`/api/v1/teams/${teamId}/leave`),

  // Invites - team management (owner/admin sends)
  inviteMember: (teamId: string, data: { email: string; role?: 'admin' | 'worker' }) =>
    api.post(`/api/v1/teams/${teamId}/invites`, data),

  listInvites: (teamId: string) =>
    api.get(`/api/v1/teams/${teamId}/invites`),

  cancelInvite: (teamId: string, inviteId: string) =>
    api.delete(`/api/v1/teams/${teamId}/invites/${inviteId}`),

  // Invites - user-facing (invited user accepts/declines)
  getMyPendingInvites: () =>
    api.get('/api/v1/teams/invites/pending'),

  acceptInvite: (inviteCode: string) =>
    api.post(`/api/v1/teams/invites/${inviteCode}/accept`),

  declineInvite: (inviteCode: string) =>
    api.post(`/api/v1/teams/invites/${inviteCode}/decline`),
};

// =============================================================================
// SUBSCRIPTIONS API
// =============================================================================

export const subscriptionsApi = {
  getTiers: () =>
    api.get('/api/v1/subscriptions/tiers'),

  getMySubscription: () =>
    api.get('/api/v1/subscriptions/me'),

  getUsage: () =>
    api.get('/api/v1/subscriptions/usage'),

  getLimits: () =>
    api.get('/api/v1/subscriptions/limits'),

  // POST /api/v1/subscriptions/checkout — Stripe Checkout (browser; wallets if Dashboard-enabled).
  createCheckoutSession: (payload: {
    tier: 'tradie' | 'team';
    successUrl?: string;
    cancelUrl?: string;
  }) => api.post('/api/v1/subscriptions/checkout', payload),

  // POST /api/v1/subscriptions/payment-sheet — native PaymentSheet (Phase 2).
  createPaymentSheetSession: (payload: { tier: 'tradie' | 'team' }) =>
    api.post('/api/v1/subscriptions/payment-sheet', payload),

  // GET /api/v1/subscriptions/iap/products — store product IDs (Phase 3).
  getIapProducts: () => api.get('/api/v1/subscriptions/iap/products'),

  // POST /api/v1/subscriptions/iap/verify — verify store purchase (Phase 3).
  verifyIap: (payload: {
    platform: 'ios' | 'android';
    productId: string;
    transactionId: string;
    receiptOrToken: string;
  }) => api.post('/api/v1/subscriptions/iap/verify', payload),

  // POST /api/v1/subscriptions/portal — Stripe Billing Portal session (manage existing sub).
  createBillingPortalSession: (payload?: { returnUrl?: string }) =>
    api.post('/api/v1/subscriptions/portal', payload ?? {}),
};

// =============================================================================
// FEEDBACK API (Lane A — universal product feedback)
// =============================================================================

export const feedbackApi = {
  submit: (payload: {
    category: 'bug' | 'idea' | 'other' | 'rating';
    message: string;
    rating?: number;
    pageContext?: string;
    appVersion?: string;
  }) => api.post('/api/v1/feedback', payload),
};

// =============================================================================
// REFERRALS API — SaaS free-month friend invite
// =============================================================================

export type ReferralMe = {
  eligible: boolean;
  code: string | null;
  shareUrl: string | null;
  freeMonthsBalance: number;
  pendingReferralCode: string | null;
  stats: { pending: number; activated: number };
  offerCopy: string;
};

export const referralsApi = {
  me: () =>
    api.get<{ success: boolean; data: ReferralMe }>('/api/v1/referrals/me'),

  attach: (code: string) =>
    api.post<{ success: boolean; data: { code: string; status: string }; message?: string }>(
      '/api/v1/referrals/attach',
      { code }
    ),

  lookup: (code: string) =>
    api.get<{
      success: boolean;
      data: { code: string; referrerName: string | null; offerCopy: string };
    }>(`/api/v1/referrals/lookup/${encodeURIComponent(code)}`),
};

export default api;
