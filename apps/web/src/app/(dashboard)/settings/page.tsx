'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient, subscriptionsClient, ApiError } from '@/lib/api-client';
import type {
  User,
  SubscriptionInfo,
  TierUsage,
  TierLimits,
  TradeType,
} from '@bossboard/shared';
import { Smartphone, Pencil } from 'lucide-react';

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
          Plan changes and billing are currently managed in the BossBoard mobile app.
        </p>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Smartphone size={18} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Get the BossBoard app</h2>
            <p className="text-sm text-gray-600 mt-1">
              Day-to-day work — creating invoices, capturing photos, generating SWMS, clocking
              in to jobs — happens in the mobile app. Web is for reviewing your account from a
              desktop. App Store + Google Play release coming soon.
            </p>
          </div>
        </div>
      </Card>
    </div>
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
