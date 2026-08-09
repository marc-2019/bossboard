'use client';

import Link from 'next/link';
import { Check, Circle, Rocket, X } from 'lucide-react';
import type { GettingStartedStatus } from '@bossboard/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Props = {
  status: GettingStartedStatus;
  onDismiss: () => void;
  onStartTour: () => void;
  dismissing?: boolean;
};

export function GettingStartedChecklist({
  status,
  onDismiss,
  onStartTour,
  dismissing = false,
}: Props) {
  if (!status.showChecklist) return null;

  const pct =
    status.totalCount > 0
      ? Math.round((status.completedCount / status.totalCount) * 100)
      : 0;

  return (
    <Card className="mb-6 border-accent/20 bg-gradient-to-br from-white to-accent/5" data-tour="getting-started">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Rocket size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Get paid — setup path
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Do these in order so your first invoice has products, a client, and bank details.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label="Dismiss getting started"
          title="Dismiss"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>
            {status.completedCount} of {status.totalCount} complete
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2 mb-4">
        {status.steps.map((step, i) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                step.done
                  ? 'border-green-100 bg-green-50/60'
                  : 'border-border-light bg-white hover:border-accent/40 hover:shadow-sm'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {step.done ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300 text-[10px] font-semibold text-gray-500">
                    {i + 1}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium ${
                    step.done ? 'text-green-900 line-through decoration-green-600/40' : 'text-gray-900'
                  }`}
                >
                  {step.title}
                </span>
                <span className="block text-xs text-gray-600 mt-0.5">{step.description}</span>
              </span>
              {!step.done && (
                <span className="shrink-0 text-xs font-medium text-accent self-center">Go →</span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onStartTour}>
          Show me around
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss} disabled={dismissing}>
          I&apos;ll explore myself
        </Button>
      </div>
      <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
        <Circle size={8} className="text-gray-400" />
        You can restart this anytime from Settings.
      </p>
    </Card>
  );
}
