'use client';

import { useCallback, useEffect, useRef } from 'react';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export type ProductTourProps = {
  /** When true, start the tour after mount (once). */
  autoStart: boolean;
  /** Called when tour is finished or skipped (persist server-side). */
  onComplete: () => void | Promise<void>;
  /** Imperative start — parent can call via ref pattern by re-setting a key + flag. */
  startToken?: number;
};

const STEPS: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to BossBoard',
      description:
        'Get paid in a few steps. We’ll highlight where everything lives — you can skip anytime.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour="nav-settings"]',
    popover: {
      title: '1. Business & bank details',
      description:
        'Start in Settings. Add your company name and bank account — they print on every invoice so clients know where to pay.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nav-products"]',
    popover: {
      title: '2. Products & services',
      description:
        'Add what you sell once (callout, hourly rate, materials). Reuse them on invoices instead of retyping prices.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nav-customers"]',
    popover: {
      title: '3. Clients',
      description:
        'Save each client you bill. Then creating an invoice is pick client → pick products → send.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nav-invoices"]',
    popover: {
      title: '4. Create & send invoices',
      description:
        'New invoice → choose client and products. Email the PDF or share a link, then track unpaid on the dashboard.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="getting-started"], [data-tour="nav-dashboard"]',
    popover: {
      title: 'You’re ready',
      description:
        'Use the Getting Started checklist on the dashboard to work through the steps. You can replay this tour from Settings anytime.',
      side: 'bottom',
      align: 'start',
    },
  },
];

/**
 * First-login spotlight tour (driver.js).
 * Highlights Settings → Products → Clients → Invoices in dependency order.
 */
export function ProductTour({ autoStart, onComplete, startToken = 0 }: ProductTourProps) {
  const driverRef = useRef<Driver | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      await onCompleteRef.current();
    } catch {
      /* non-fatal — tour UX shouldn't block */
    }
  }, []);

  const start = useCallback(() => {
    // Destroy any existing instance
    if (driverRef.current) {
      try {
        driverRef.current.destroy();
      } catch {
        /* ignore */
      }
      driverRef.current = null;
    }
    completedRef.current = false;

    // On mobile the sidebar may be closed — open it so highlights work.
    const mobileToggle = document.querySelector<HTMLButtonElement>(
      'button.lg\\:hidden.fixed.top-4.left-4',
    );
    const sidebar = document.querySelector('aside');
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (!isDesktop && mobileToggle && sidebar && !sidebar.classList.contains('translate-x-0')) {
      // Best-effort: click hamburger if overlay not open
      const navVisible = !!document.querySelector('[data-tour="nav-settings"]');
      if (!navVisible) {
        mobileToggle.click();
      }
    }

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 10,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      progressText: '{{current}} of {{total}}',
      steps: STEPS,
      onDestroyStarted: () => {
        // User closed via X, overlay, or finished last step
        void finish();
        d.destroy();
      },
    });
    driverRef.current = d;
    d.drive();
  }, [finish]);

  // Auto-start once when flagged
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Small delay so dashboard + sidebar paint and data-tour anchors exist
    const t = window.setTimeout(() => start(), 450);
    return () => window.clearTimeout(t);
  }, [autoStart, start]);

  // Imperative re-start from Settings / checklist
  const lastToken = useRef(0);
  useEffect(() => {
    if (!startToken || startToken === lastToken.current) return;
    lastToken.current = startToken;
    autoStarted.current = true;
    start();
  }, [startToken, start]);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        try {
          driverRef.current.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return null;
}
