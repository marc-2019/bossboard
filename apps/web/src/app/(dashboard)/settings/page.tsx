'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  authClient,
  subscriptionsClient,
  referralsClient,
  businessProfileClient,
  ApiError,
  type BusinessProfileUpdate,
} from '@/lib/api-client';
import type {
  User,
  SubscriptionInfo,
  TierUsage,
  TierLimits,
  TradeType,
} from '@bossboard/shared';
import { Smartphone, Pencil, Gift, Copy, Check, Building2, Landmark } from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | Date | null) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

const tierLabel: Record<string, string> = {
  free: 'Free',
  tradie: 'Tradie',
  team: 'Team',
};

const tierBlurb: Record<string, string> = {
  free: '3 invoices and 2 SWMS per month, single user.',
  tradie: 'Unlimited invoices and SWMS, AI hazard ID, PDF + email exports.',
  team: 'Everything in Tradie, plus up to 5 team members.',
};

const tradeTypeOptions: { value: TradeType; label: string }[] = [
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'builder', label: 'Builder' },
  { value: 'landscaper', label: 'Landscaper' },
  { value: 'painter', label: 'Painter' },
  { value: 'other', label: 'Other' },
];

const tradeTypeLabel: Record<TradeType, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  builder: 'Builder',
  landscaper: 'Landscaper',
  painter: 'Painter',
  other: 'Other',
};

function formatLimit(n: number | null) {
  return n === null ? 'Unlimited' : String(n);
}

// NZ-friendly phone: digits, spaces, dashes, parens, leading +. Min 6 digits when present.
const PHONE_PATTERN = /^[+()0-9\s-]{6,}$/;

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<TierUsage | null>(null);
  const [limits, setLimits] = useState<TierLimits | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    authClient
      .me()
      .then((data) => {
        if (!cancelled) setUser((data as { user: User }).user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load profile.');
      });

    subscriptionsClient.me().then((d) => !cancelled && setSubscription(d.subscription)).catch(() => {});
    subscriptionsClient.usage().then((d) => !cancelled && setUsage(d.usage)).catch(() => {});
    subscriptionsClient.limits().then((d) => !cancelled && setLimits(d.limits)).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <ProfileCard user={user} onUserUpdated={setUser} />

      <BusinessProfileCard />

      <BankDetailsCard />

      <Card>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Subscription
        </h2>
        {subscription ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-border-light">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {tierLabel[subscription.tier] || subscription.tier}
                </p>
                <p className="text-sm text-gray-600">{tierBlurb[subscription.tier] || ''}</p>
              </div>
              {subscription.expiresAt && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Renews</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(subscription.expiresAt)}
                  </p>
                </div>
              )}
            </div>

            {(subscription.freeMonthsBalance ?? 0) > 0 && (
              <p className="text-sm text-green-700 mb-3">
                Free months on your account:{' '}
                <strong>{subscription.freeMonthsBalance}</strong> (stacks up to 12).
              </p>
            )}

            {limits && usage && (
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <UsageStat
                  label="Invoices this month"
                  used={usage.invoicesThisMonth}
                  cap={limits.invoicesPerMonth}
                />
                <UsageStat
                  label="SWMS this month"
                  used={usage.swmsThisMonth}
                  cap={limits.swmsPerMonth}
                />
                <UsageStat
                  label="Team members"
                  used={usage.teamMemberCount}
                  cap={limits.teamMembers}
                />
              </dl>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 py-4">Loading subscription…</p>
        )}
        <p className="text-xs text-gray-500 mt-4">
          Plan changes and billing checkout are currently completed in the BossBoard mobile app
          (App Store / Google Play where available). Web shows tier usage and referral invites.
        </p>
      </Card>

      <ReferralCard />

      <Card>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Smartphone size={18} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Get the BossBoard app</h2>
            <p className="text-sm text-gray-600 mt-1">
              Use web for invoices, recurring templates, bank CSV recon, clients, products,
              quotes, and settings. The mobile app is best for on-site photos, clock-in, and
              field SWMS. App Store + Google Play where available.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BusinessProfileCard() {
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    tradingAs: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    irdNumber: '',
    gstNumber: '',
    isGstRegistered: false,
    invoicePrefix: 'INV',
    defaultPaymentTerms: '20',
    defaultNotes: '',
  });

  const load = () => {
    setLoading(true);
    businessProfileClient
      .get()
      .then((d) => {
        const p = d.profile;
        if (!p) return;
        setForm({
          companyName: p.companyName || '',
          tradingAs: p.tradingAs || '',
          companyAddress: p.companyAddress || '',
          companyPhone: p.companyPhone || '',
          companyEmail: p.companyEmail || '',
          irdNumber: p.irdNumber || '',
          gstNumber: p.gstNumber || '',
          isGstRegistered: Boolean(p.isGstRegistered),
          invoicePrefix: p.invoicePrefix || 'INV',
          defaultPaymentTerms:
            p.defaultPaymentTerms != null ? String(p.defaultPaymentTerms) : '20',
          defaultNotes: p.defaultNotes || '',
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const terms = form.defaultPaymentTerms.trim()
      ? parseInt(form.defaultPaymentTerms, 10)
      : undefined;
    if (terms !== undefined && (!Number.isFinite(terms) || terms < 1 || terms > 365)) {
      setError('Payment terms must be 1–365 days.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: BusinessProfileUpdate = {
        companyName: form.companyName.trim() || undefined,
        tradingAs: form.tradingAs.trim() || undefined,
        companyAddress: form.companyAddress.trim() || undefined,
        companyPhone: form.companyPhone.trim() || undefined,
        companyEmail: form.companyEmail.trim() || undefined,
        irdNumber: form.irdNumber.trim() || undefined,
        gstNumber: form.gstNumber.trim() || undefined,
        isGstRegistered: form.isGstRegistered,
        invoicePrefix: form.invoicePrefix.trim() || undefined,
        defaultPaymentTerms: terms,
        defaultNotes: form.defaultNotes.trim() || undefined,
      };
      await businessProfileClient.update(payload);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save business profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide inline-flex items-center gap-2">
          <Building2 size={14} />
          Business profile
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-accent hover:underline inline-flex items-center gap-1"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      {saved && <p className="text-sm text-green-700 mb-2">Saved.</p>}
      {!loading && !editing && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-gray-500">Company</dt>
            <dd className="font-medium text-gray-900">{form.companyName || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">GST</dt>
            <dd className="font-medium text-gray-900">
              {form.isGstRegistered ? form.gstNumber || 'Registered' : 'Not registered'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Invoice prefix</dt>
            <dd className="font-medium text-gray-900">{form.invoicePrefix || 'INV'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Default terms</dt>
            <dd className="font-medium text-gray-900">
              {form.defaultPaymentTerms ? `${form.defaultPaymentTerms} days` : '—'}
            </dd>
          </div>
        </dl>
      )}
      {!loading && editing && (
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Company name"
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
            <Input
              label="Trading as"
              value={form.tradingAs}
              onChange={(e) => set('tradingAs', e.target.value)}
            />
            <Input
              label="Company email"
              type="email"
              value={form.companyEmail}
              onChange={(e) => set('companyEmail', e.target.value)}
            />
            <Input
              label="Company phone"
              value={form.companyPhone}
              onChange={(e) => set('companyPhone', e.target.value)}
            />
            <Input
              label="IRD number"
              value={form.irdNumber}
              onChange={(e) => set('irdNumber', e.target.value)}
            />
            <Input
              label="GST number"
              value={form.gstNumber}
              onChange={(e) => set('gstNumber', e.target.value)}
            />
            <Input
              label="Invoice prefix"
              value={form.invoicePrefix}
              onChange={(e) => set('invoicePrefix', e.target.value)}
              maxLength={10}
            />
            <Input
              label="Default payment terms (days)"
              type="number"
              min={1}
              max={365}
              value={form.defaultPaymentTerms}
              onChange={(e) => set('defaultPaymentTerms', e.target.value)}
            />
          </div>
          <Input
            label="Company address"
            value={form.companyAddress}
            onChange={(e) => set('companyAddress', e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isGstRegistered}
              onChange={(e) => set('isGstRegistered', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent"
            />
            GST registered
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default invoice notes
            </label>
            <textarea
              value={form.defaultNotes}
              onChange={(e) => set('defaultNotes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={submitting} size="sm">
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p className="text-xs text-gray-500 mt-3">
        Used on invoices (company block, GST, prefix, default notes).
      </p>
    </Card>
  );
}

function BankDetailsCard() {
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    intlBankAccountName: '',
    intlIban: '',
    intlSwiftBic: '',
    intlBankName: '',
    intlBankAddress: '',
    intlRoutingNumber: '',
  });

  const load = () => {
    setLoading(true);
    businessProfileClient
      .get()
      .then((d) => {
        const p = d.profile;
        if (!p) return;
        setForm({
          bankAccountName: p.bankAccountName || '',
          bankAccountNumber: p.bankAccountNumber || '',
          bankName: p.bankName || '',
          intlBankAccountName: p.intlBankAccountName || '',
          intlIban: p.intlIban || '',
          intlSwiftBic: p.intlSwiftBic || '',
          intlBankName: p.intlBankName || '',
          intlBankAddress: p.intlBankAddress || '',
          intlRoutingNumber: p.intlRoutingNumber || '',
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await businessProfileClient.update({
        bankAccountName: form.bankAccountName.trim() || undefined,
        bankAccountNumber: form.bankAccountNumber.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        intlBankAccountName: form.intlBankAccountName.trim() || undefined,
        intlIban: form.intlIban.trim() || undefined,
        intlSwiftBic: form.intlSwiftBic.trim() || undefined,
        intlBankName: form.intlBankName.trim() || undefined,
        intlBankAddress: form.intlBankAddress.trim() || undefined,
        intlRoutingNumber: form.intlRoutingNumber.trim() || undefined,
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save bank details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide inline-flex items-center gap-2">
          <Landmark size={14} />
          Bank details
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-accent hover:underline inline-flex items-center gap-1"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      {saved && <p className="text-sm text-green-700 mb-2">Saved.</p>}
      {!loading && !editing && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-gray-500">Account name</dt>
            <dd className="font-medium text-gray-900">{form.bankAccountName || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Account number</dt>
            <dd className="font-mono text-sm text-gray-900">{form.bankAccountNumber || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Bank</dt>
            <dd className="font-medium text-gray-900">{form.bankName || '—'}</dd>
          </div>
          {form.intlIban && (
            <div>
              <dt className="text-gray-500">IBAN</dt>
              <dd className="font-mono text-sm text-gray-900">{form.intlIban}</dd>
            </div>
          )}
        </dl>
      )}
      {!loading && editing && (
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">NZD account</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Account name"
              value={form.bankAccountName}
              onChange={(e) => set('bankAccountName', e.target.value)}
            />
            <Input
              label="Account number"
              value={form.bankAccountNumber}
              onChange={(e) => set('bankAccountNumber', e.target.value)}
              placeholder="12-3456-7890123-00"
            />
            <Input
              label="Bank name"
              value={form.bankName}
              onChange={(e) => set('bankName', e.target.value)}
            />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase pt-2">
            International (optional)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Account name"
              value={form.intlBankAccountName}
              onChange={(e) => set('intlBankAccountName', e.target.value)}
            />
            <Input
              label="IBAN"
              value={form.intlIban}
              onChange={(e) => set('intlIban', e.target.value)}
            />
            <Input
              label="SWIFT/BIC"
              value={form.intlSwiftBic}
              onChange={(e) => set('intlSwiftBic', e.target.value)}
            />
            <Input
              label="Bank name"
              value={form.intlBankName}
              onChange={(e) => set('intlBankName', e.target.value)}
            />
            <Input
              label="Bank address"
              value={form.intlBankAddress}
              onChange={(e) => set('intlBankAddress', e.target.value)}
            />
            <Input
              label="Routing number"
              value={form.intlRoutingNumber}
              onChange={(e) => set('intlRoutingNumber', e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={submitting} size="sm">
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p className="text-xs text-gray-500 mt-3">
        Printed on invoices so clients know where to pay.
      </p>
    </Card>
  );
}

function ReferralCard() {
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [offerCopy, setOfferCopy] = useState('');
  const [freeMonths, setFreeMonths] = useState(0);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ pending: 0, activated: 0 });
  const [attachInput, setAttachInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    referralsClient
      .me()
      .then((d) => {
        if (cancelled) return;
        setEligible(d.eligible);
        setCode(d.code);
        setShareUrl(d.shareUrl);
        setOfferCopy(d.offerCopy);
        setFreeMonths(d.freeMonthsBalance);
        setPendingCode(d.pendingReferralCode);
        setStats(d.stats);
      })
      .catch(() => {
        /* optional surface */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select the link and copy manually.');
    }
  };

  const attach = async () => {
    setErr(null);
    setMsg(null);
    setAttaching(true);
    try {
      const r = await referralsClient.attach(attachInput.trim());
      setPendingCode(r.code);
      setMsg('Friend code saved. When you subscribe, you both get a free month.');
      setAttachInput('');
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : 'Could not attach code.');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
          <Gift size={18} className="text-green-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">Invite a mate</h2>
          <p className="text-sm text-gray-600 mt-1">
            {offerCopy ||
              'Give a mate a free month of BossBoard — when they pay, you both get a free month.'}
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading referral…</p>}

      {!loading && eligible && shareUrl && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <code className="flex-1 text-sm bg-gray-50 border border-border rounded-lg px-3 py-2 break-all">
              {shareUrl}
            </code>
            <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
              {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Your code: <span className="font-mono font-semibold">{code}</span>
            {stats.activated > 0 && (
              <> · {stats.activated} mate{stats.activated === 1 ? '' : 's'} subscribed</>
            )}
            {stats.pending > 0 && <> · {stats.pending} pending</>}
          </p>
          {freeMonths > 0 && (
            <p className="text-sm text-green-700">
              Free months balance: <strong>{freeMonths}</strong> / 12
            </p>
          )}
        </div>
      )}

      {!loading && !eligible && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Subscribe to Tradie or Team to get your invite link. If a mate already shared a code
            with you, enter it below before you pay.
          </p>
          {pendingCode ? (
            <p className="text-sm text-green-700">
              Friend code <span className="font-mono font-semibold">{pendingCode}</span> is saved
              for when you subscribe.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                label="Friend code"
                value={attachInput}
                onChange={(e) => setAttachInput(e.target.value.toUpperCase())}
                placeholder="BBABC123"
              />
              <div className="flex items-end">
                <Button type="button" onClick={attach} loading={attaching} disabled={!attachInput.trim()}>
                  Save code
                </Button>
              </div>
            </div>
          )}
          {freeMonths > 0 && (
            <p className="text-sm text-green-700">
              Free months balance: <strong>{freeMonths}</strong> / 12
            </p>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-green-700 mt-2">{msg}</p>}
      {err && <p className="text-sm text-danger mt-2">{err}</p>}
    </Card>
  );
}

interface ProfileCardProps {
  user: User | null;
  onUserUpdated: (user: User) => void;
}

function ProfileCard({ user, onUserUpdated }: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tradeType, setTradeType] = useState<TradeType | ''>('');
  const [businessName, setBusinessName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
  }>({});
  const [savedFlash, setSavedFlash] = useState(false);

  const startEdit = () => {
    if (!user) return;
    setName(user.name ?? '');
    setPhone(user.phone ?? '');
    setTradeType(user.tradeType ?? '');
    setBusinessName(user.businessName ?? '');
    setSaveError(null);
    setFieldErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveError(null);
    setFieldErrors({});
  };

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errs.name = 'Name is required.';
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_PATTERN.test(trimmedPhone)) {
      errs.phone = 'Enter a valid phone number (digits, spaces, dashes or +).';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!validate()) return;

    const payload: {
      name?: string;
      phone?: string;
      tradeType?: TradeType;
      businessName?: string;
    } = {
      name: name.trim(),
      // Send empty string to clear optional fields; backend treats undefined as no-change
      phone: phone.trim(),
      businessName: businessName.trim(),
    };
    if (tradeType) {
      payload.tradeType = tradeType;
    }

    setSubmitting(true);
    try {
      const data = await authClient.updateMe(payload);
      onUserUpdated((data as { user: User }).user);
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError('Could not save profile. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Profile
        </h2>
        {user && !editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startEdit}
            aria-label="Edit profile"
          >
            <Pencil size={14} className="mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      {!user ? (
        <p className="text-sm text-gray-500 py-4">Loading profile…</p>
      ) : editing ? (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
              required
              autoComplete="name"
            />
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={fieldErrors.phone}
              inputMode="tel"
              autoComplete="tel"
              placeholder="021 123 4567"
            />
            <div className="space-y-1">
              <label
                htmlFor="trade-type"
                className="block text-sm font-medium text-gray-700"
              >
                Trade type
              </label>
              <select
                id="trade-type"
                value={tradeType}
                onChange={(e) => setTradeType(e.target.value as TradeType | '')}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
              >
                <option value="">Not set</option>
                {tradeTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
            />
          </div>

          <p className="text-xs text-gray-500">
            Email and verification status are managed separately for security — contact support
            to change your email address.
          </p>

          {saveError && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
              <p className="text-sm text-danger">{saveError}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancelEdit}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Name" value={user.name || '—'} />
            <Field label="Email" value={user.email} />
            <Field label="Phone" value={user.phone || '—'} />
            <Field
              label="Trade type"
              value={user.tradeType ? tradeTypeLabel[user.tradeType] : '—'}
            />
            <Field label="Business name" value={user.businessName || '—'} />
            <Field label="Verified" value={user.isVerified ? 'Yes' : 'No'} />
          </dl>
          {savedFlash && (
            <p className="text-xs text-emerald-700 mt-4" role="status">
              Profile saved.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function UsageStat({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}) {
  const text = cap === null ? `${used}` : `${used} / ${cap}`;
  return (
    <div className="rounded-lg border border-border-light p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-semibold text-gray-900 mt-0.5">{text}</p>
      <p className="text-xs text-gray-500 mt-0.5">{formatLimit(cap) === 'Unlimited' ? 'Unlimited' : `Cap ${formatLimit(cap)}`}</p>
    </div>
  );
}
