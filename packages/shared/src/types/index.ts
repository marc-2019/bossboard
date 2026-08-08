/**
 * BossBoard Shared Types
 * Single source of truth for all entity types across API, mobile, and web.
 */

// =============================================================================
// USER TYPES
// =============================================================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  tradeType: TradeType | null;
  businessName: string | null;
  isVerified: boolean;
  onboardingCompleted: boolean;
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TradeType = 'electrician' | 'plumber' | 'builder' | 'landscaper' | 'painter' | 'other';

export interface UserCreateInput {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  tradeType?: TradeType;
  businessName?: string;
}

export interface UserLoginInput {
  email: string;
  password: string;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
  teamId?: string;
  teamRole?: TeamRole;
  iat?: number;
  exp?: number;
}

// =============================================================================
// SWMS TYPES
// =============================================================================

export interface SWMSDocument {
  id: string;
  userId: string;
  templateType: TradeType;
  title: string;
  status: SWMSStatus;
  jobDescription: string | null;
  siteAddress: string | null;
  clientName: string | null;
  expectedDuration: string | null;
  hazards: Hazard[];
  controls: Control[];
  ppeRequired: string[];
  emergencyPlan: string | null;
  isolationProcedure: string | null;
  workerSignature: string | null;
  workerSignedAt: Date | null;
  supervisorSignature: string | null;
  supervisorSignedAt: Date | null;
  pdfUrl: string | null;
  isSynced: boolean;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SWMSStatus = 'draft' | 'signed' | 'archived';

export interface Hazard {
  id: string;
  category: string;
  description: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
  aiGenerated: boolean;
}

export interface Control {
  hazardId: string;
  controlType: ControlType;
  description: string;
  ppeRequired?: string[];
  aiGenerated: boolean;
}

export type ControlType = 'elimination' | 'substitution' | 'engineering' | 'administrative' | 'ppe';

export interface SWMSGenerateInput {
  tradeType: TradeType;
  jobDescription: string;
  siteAddress?: string;
  clientName?: string;
  expectedDuration?: string;
  useAI?: boolean;
}

export interface SWMSGenerateResponse {
  swmsId: string;
  document: Partial<SWMSDocument>;
  suggestedHazards: Hazard[];
  suggestedControls: Control[];
  template: SWMSTemplate;
}

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

export interface SWMSTemplate {
  tradeType: TradeType;
  version: string;
  nzRegulations: string[];
  sections: TemplateSection[];
  aiPrompts: {
    hazardSuggestions: string;
    controlSuggestions: string;
  };
}

export interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  aiAssisted?: boolean;
  fields: TemplateField[];
}

export interface TemplateField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checklist' | 'date' | 'signature' | 'checkbox' | 'number' | 'calculated' | 'steps';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
  min?: number;
  max?: number;
}

// =============================================================================
// RISK ASSESSMENT TYPES
// =============================================================================

export interface RiskAssessment {
  id: string;
  userId: string;
  swmsId: string | null;
  title: string;
  siteAddress: string | null;
  assessments: RiskItem[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'extreme' | null;
  reviewDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskItem {
  hazard: string;
  potentialHarm: string;
  likelihood: number;
  consequence: number;
  riskRating: number;
  controls: string[];
  residualLikelihood?: number;
  residualConsequence?: number;
  residualRisk?: number;
  responsiblePerson?: string;
  completionDate?: Date;
}

// =============================================================================
// CERTIFICATION TYPES
// =============================================================================

export interface Certification {
  id: string;
  userId: string;
  type: CertificationType;
  name: string;
  certNumber: string | null;
  issuingBody: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  documentUrl: string | null;
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CertificationType = 'electrical' | 'gas' | 'plumbing' | 'lpg' | 'first_aid' | 'site_safe' | 'other';

export interface CertificationCreateInput {
  type: CertificationType;
  name: string;
  certNumber?: string;
  issuingBody?: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface CertificationUpdateInput {
  type?: CertificationType;
  name?: string;
  certNumber?: string | null;
  issuingBody?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
}

// =============================================================================
// INVOICE TYPES
// =============================================================================

/** How a client-invoice discount is entered. Applied before GST. */
export type InvoiceDiscountType = 'none' | 'fixed' | 'percent';

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  swmsId: string | null;
  jobDescription: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  /** none | fixed (cents in discountValue) | percent (0–100 in discountValue) */
  discountType: InvoiceDiscountType;
  /** Input value: cents if fixed, whole percent if percent */
  discountValue: number;
  /** Computed discount in cents applied before GST (capped at subtotal) */
  discountAmount: number;
  /** Optional label on PDF / detail (defaults to "Discount") */
  discountLabel: string | null;
  gstAmount: number;
  total: number;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: Date | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  notes: string | null;
  customerId: string | null;
  recurringInvoiceId: string | null;
  includeGst: boolean;
  intlBankAccountName: string | null;
  intlIban: string | null;
  intlSwiftBic: string | null;
  intlBankName: string | null;
  intlBankAddress: string | null;
  companyName: string | null;
  companyAddress: string | null;
  irdNumber: string | null;
  gstNumber: string | null;
  shareToken: string | null;
  // Payment gateway fields (Phase 1 — Stripe Payment Links)
  paymentProvider: PaymentProvider | null;
  paymentReference: string | null;
  paymentLinkUrl: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  amount: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export type PaymentProvider = 'stripe' | 'windcave' | 'akahu' | 'manual';

export interface InvoiceCreateInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  swmsId?: string;
  jobDescription?: string;
  lineItems: { description: string; amount: number }[];
  includeGst?: boolean;
  /** none | fixed | percent — default none */
  discountType?: InvoiceDiscountType;
  /** Cents if fixed; whole percent 0–100 if percent */
  discountValue?: number;
  /** Optional PDF/detail label */
  discountLabel?: string | null;
  dueDate?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  notes?: string;
  customerId?: string;
  recurringInvoiceId?: string;
  intlBankAccountName?: string;
  intlIban?: string;
  intlSwiftBic?: string;
  intlBankName?: string;
  intlBankAddress?: string;
  companyName?: string;
  companyAddress?: string;
  irdNumber?: string;
  gstNumber?: string;
}

export interface InvoiceUpdateInput {
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  swmsId?: string | null;
  jobDescription?: string;
  lineItems?: { description: string; amount: number }[];
  includeGst?: boolean;
  discountType?: InvoiceDiscountType;
  discountValue?: number;
  discountLabel?: string | null;
  dueDate?: string | null;
  bankAccountName?: string;
  bankAccountNumber?: string;
  notes?: string;
  customerId?: string | null;
  intlBankAccountName?: string;
  intlIban?: string;
  intlSwiftBic?: string;
  intlBankName?: string;
  intlBankAddress?: string;
  companyName?: string;
  companyAddress?: string;
  irdNumber?: string;
  gstNumber?: string;
}

// =============================================================================
// BUSINESS PROFILE TYPES
// =============================================================================

export interface BusinessProfile {
  id: string;
  userId: string;
  companyName: string | null;
  tradingAs: string | null;
  irdNumber: string | null;
  gstNumber: string | null;
  isGstRegistered: boolean;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  intlBankAccountName: string | null;
  intlIban: string | null;
  intlSwiftBic: string | null;
  intlBankName: string | null;
  intlBankAddress: string | null;
  intlRoutingNumber: string | null;
  defaultPaymentTerms: number;
  defaultNotes: string | null;
  invoicePrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessProfileUpsertInput {
  companyName?: string;
  tradingAs?: string;
  irdNumber?: string;
  gstNumber?: string;
  isGstRegistered?: boolean;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
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
}

// =============================================================================
// CUSTOMER TYPES
// =============================================================================

export interface Customer {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  defaultPaymentTerms: number | null;
  defaultIncludeGst: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerCreateInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  defaultPaymentTerms?: number;
  defaultIncludeGst?: boolean;
}

export interface CustomerUpdateInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  defaultPaymentTerms?: number | null;
  defaultIncludeGst?: boolean;
  isActive?: boolean;
}

// =============================================================================
// PRODUCT / SERVICE TYPES
// =============================================================================

export type ProductType = 'fixed' | 'variable';

export interface ProductService {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  unitPrice: number;
  type: ProductType;
  isGstApplicable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductServiceCreateInput {
  name: string;
  description?: string;
  unitPrice: number;
  type?: ProductType;
  isGstApplicable?: boolean;
}

export interface ProductServiceUpdateInput {
  name?: string;
  description?: string | null;
  unitPrice?: number;
  type?: ProductType;
  isGstApplicable?: boolean;
  isActive?: boolean;
}

// =============================================================================
// RECURRING INVOICE TYPES
// =============================================================================

export interface RecurringInvoice {
  id: string;
  userId: string;
  customerId: string;
  name: string;
  recurrence: 'monthly';
  dayOfMonth: number;
  isAutoGenerate: boolean;
  includeGst: boolean;
  paymentTerms: number;
  notes: string | null;
  isActive: boolean;
  lastGeneratedAt: Date | null;
  nextGenerationDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: Customer;
  lineItems?: RecurringLineItem[];
}

export interface RecurringLineItem {
  id: string;
  recurringInvoiceId: string;
  productServiceId: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  type: ProductType;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  productName?: string;
}

export interface RecurringInvoiceCreateInput {
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
    type: ProductType;
  }[];
}

export interface RecurringInvoiceUpdateInput {
  name?: string;
  dayOfMonth?: number;
  includeGst?: boolean;
  paymentTerms?: number;
  notes?: string | null;
  isActive?: boolean;
  lineItems?: {
    productServiceId: string;
    description?: string;
    unitPrice: number;
    quantity?: number;
    type: ProductType;
  }[];
}

// =============================================================================
// BANK TRANSACTION TYPES
// =============================================================================

export type MatchConfidence = 'none' | 'low' | 'medium' | 'high' | 'confirmed';

export interface BankTransaction {
  id: string;
  userId: string;
  transactionId: string | null;
  date: string;
  amount: number;
  currency: string;
  description: string | null;
  paymentReference: string | null;
  runningBalance: number | null;
  matchedInvoiceId: string | null;
  matchConfidence: MatchConfidence;
  isReconciled: boolean;
  reconciledAt: Date | null;
  uploadBatchId: string | null;
  sourceFilename: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// STATS TYPES
// =============================================================================

export interface DashboardStats {
  swms: {
    total: number;
    thisMonth: number;
    signed: number;
    draft: number;
  };
  invoices: {
    total: number;
    unpaid: number;
    unpaidAmount: number;
    thisMonth: number;
  };
  quotes: {
    total: number;
    pending: number;
    pendingAmount: number;
    accepted: number;
    thisMonth: number;
  };
  certifications: {
    total: number;
    expiringSoon: number;
    expired: number;
  };
}

// =============================================================================
// INSIGHTS TYPES
// =============================================================================

export interface RevenueComparison {
  thisMonth: number;
  lastMonth: number;
  percentChange: number;
}

export interface InvoiceAging {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyPlus: number;
  currentAmount: number;
  thirtyDayAmount: number;
  sixtyDayAmount: number;
  ninetyPlusAmount: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  revenue: number;
  invoiceCount: number;
}

export interface MonthlyRevenue {
  month: string;
  label: string;
  revenue: number;
  count: number;
}

export interface InsightsData {
  revenue: RevenueComparison;
  aging: InvoiceAging;
  topCustomers: TopCustomer[];
  monthlyRevenue: MonthlyRevenue[];
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// PHOTOS
// =============================================================================

export type PhotoEntityType = 'swms' | 'invoice' | 'expense' | 'job_log' | 'certification' | 'quote';

export interface Photo {
  id: string;
  userId: string;
  entityType: PhotoEntityType;
  entityId: string;
  filename: string;
  originalFilename: string | null;
  mimeType: string;
  fileSize: number | null;
  path: string;
  caption: string | null;
  createdAt: Date;
}

export interface CreatePhotoInput {
  entityType: PhotoEntityType;
  entityId: string;
  filename: string;
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  path: string;
  caption?: string;
}

// =============================================================================
// QUOTE TYPES
// =============================================================================

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted';

export interface Quote {
  id: string;
  userId: string;
  quoteNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  customerId: string | null;
  jobDescription: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
  includeGst: boolean;
  status: QuoteStatus;
  validUntil: string | null;
  convertedInvoiceId: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  intlBankAccountName: string | null;
  intlIban: string | null;
  intlSwiftBic: string | null;
  intlBankName: string | null;
  intlBankAddress: string | null;
  companyName: string | null;
  companyAddress: string | null;
  irdNumber: string | null;
  gstNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteCreateInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  customerId?: string;
  jobDescription?: string;
  lineItems: { description: string; amount: number }[];
  includeGst?: boolean;
  validUntil?: string;
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
}

export interface QuoteUpdateInput {
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  customerId?: string | null;
  jobDescription?: string;
  lineItems?: { description: string; amount: number }[];
  includeGst?: boolean;
  validUntil?: string | null;
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
}

// =============================================================================
// EXPENSES
// =============================================================================

export type ExpenseCategory = 'materials' | 'fuel' | 'tools' | 'subcontractor' | 'vehicle' | 'office' | 'other';

export interface Expense {
  id: string;
  userId: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  vendor: string | null;
  isGstClaimable: boolean;
  gstAmount: number;
  receiptPhotoId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCreateInput {
  date?: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  vendor?: string;
  isGstClaimable?: boolean;
  notes?: string;
}

export interface ExpenseUpdateInput {
  date?: string;
  amount?: number;
  category?: ExpenseCategory;
  description?: string;
  vendor?: string;
  isGstClaimable?: boolean;
  notes?: string;
}

export interface ExpenseStats {
  total: number;
  thisMonth: number;
  thisMonthAmount: number;
  gstClaimable: number;
  byCategory: Record<ExpenseCategory, number>;
}

// =============================================================================
// JOB LOGS
// =============================================================================

export type JobLogStatus = 'active' | 'completed';

export interface JobLog {
  id: string;
  userId: string;
  description: string;
  siteAddress: string | null;
  customerId: string | null;
  startTime: string;
  endTime: string | null;
  status: JobLogStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobLogCreateInput {
  description: string;
  siteAddress?: string;
  customerId?: string;
  startTime?: string;
  notes?: string;
}

export interface JobLogUpdateInput {
  description?: string;
  siteAddress?: string;
  customerId?: string | null;
  notes?: string;
}

// =============================================================================
// TEAM TYPES
// =============================================================================

export type TeamRole = 'owner' | 'admin' | 'worker';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  inviteStatus: InviteStatus;
  invitedBy: string | null;
  invitedEmail: string | null;
  invitedAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userName?: string;
  userEmail?: string;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  inviteCode: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  teamName?: string;
  invitedByName?: string;
}

export interface TeamCreateInput {
  name: string;
}

export interface TeamInviteMemberInput {
  email: string;
  role?: TeamRole;
}

export interface TeamUpdateMemberRoleInput {
  role: TeamRole;
}

// =============================================================================
// SUBSCRIPTION TYPES
// =============================================================================

export type SubscriptionTier = 'free' | 'tradie' | 'team';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  startedAt: Date | null;
  expiresAt: Date | null;
}

export interface TierLimits {
  tier: SubscriptionTier;
  invoicesPerMonth: number | null;
  swmsPerMonth: number | null;
  aiCallsPerMonth: number | null;
  teamMembers: number | null;
  pdfExport: boolean;
  emailInvoice: boolean;
  quotes: boolean;
  expenses: boolean;
  jobLogs: boolean;
  photos: boolean;
}

export interface TierUsage {
  invoicesThisMonth: number;
  swmsThisMonth: number;
  aiCallsThisMonth: number;
  teamMemberCount: number;
}

// =============================================================================
// FEEDBACK TYPES (Lane A — product-feedback-universal-pattern)
// =============================================================================

/** In-app feedback categories. 'rating' reserved for standalone rating prompts. */
export type FeedbackCategory = 'bug' | 'idea' | 'other' | 'rating';

/** Lifecycle: new → ingested (CF poller) → closed */
export type FeedbackStatus = 'new' | 'ingested' | 'closed';

export interface FeedbackItem {
  id: string;
  userId: string;
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  pageContext: string | null;
  appVersion: string | null;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackCreateInput {
  category: FeedbackCategory;
  message: string;
  rating?: number;
  pageContext?: string;
  appVersion?: string;
}
