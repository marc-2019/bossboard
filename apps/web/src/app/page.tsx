import type { Metadata } from 'next';
import Link from 'next/link';
import './landing.css';

/**
 * BossBoard marketing landing page.
 *
 * Public homepage at /. Replaces the previous `redirect('/dashboard')` so
 * unauthenticated visitors see the marketing page first. Authenticated
 * users still get to /dashboard via the nav "Get Started" button which
 * routes through middleware (which redirects to login or dashboard
 * appropriately based on the access_token cookie).
 *
 * History: this content was originally inlined in the Express API at
 * apps/api/src/landing.html and served from the / route of the
 * trademate-nz Railway service. As of 2026-04-11 it lives here in the
 * Next.js webapp because the webapp is the canonical home for
 * bossboard.instilligent.com.
 *
 * Notes:
 *  - Pricing card "forever" qualifier removed per Marc — don't promise
 *    permanence on the free tier, it constrains future business models.
 *  - All call-to-action buttons go to /register on the same domain
 *    (no more loop-back to the API URL that the previous version had).
 *  - Inter typeface loaded via the layout's metadata, not here.
 */

export const metadata: Metadata = {
  title: 'BossBoard | The All-in-One App for NZ Tradies',
  description:
    "Run your trade business like a boss. Jobs, teams, compliance docs and cashflow in one app. Built for NZ electricians, plumbers, builders and tradies. From $4.99/week.",
  keywords: [
    'tradie app',
    'NZ tradies',
    'SWMS generator',
    'trade compliance',
    'invoice app',
    'job management',
    'WorkSafe NZ',
    'health and safety',
    'BossBoard',
  ],
  alternates: {
    canonical: 'https://bossboard.instilligent.com/',
  },
  openGraph: {
    title: 'BossBoard | The All-in-One App for NZ Tradies',
    description:
      'Jobs, teams, compliance docs and cashflow in one app. Built for Kiwi tradies. From $4.99/week.',
    url: 'https://bossboard.instilligent.com',
    type: 'website',
  },
};

export default function Home() {
  return (
    <div className="landing-page">
      {/* Inter font — loaded via <link> instead of next/font to avoid a
          server-side font fetch in the build pipeline. */}
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      {/* Nav */}
      <nav className="nav">
        <div className="nav-inner">
          <a href="#top" className="nav-logo">
            Boss<span>Board</span>
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#nz">Why NZ</a>
            <Link href="/login" className="nav-signin">
              Sign in
            </Link>
            <Link href="/register" className="lp-btn lp-btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" id="top">
        <div className="lp-container">
          <div className="hero-badge">Built for NZ tradies, by NZ builders</div>
          <h1>
            Your whole business.
            <br />
            One screen.
          </h1>
          <p>
            Jobs, teams, compliance docs and cashflow in one app. BossBoard
            helps electricians, plumbers, builders and tradies across Aotearoa
            run their business from their pocket — you stay the boss.
          </p>
          <div className="hero-cta">
            <Link href="/register" className="lp-btn lp-btn-primary lp-btn-large">
              Start Free
            </Link>
            <a href="#features" className="lp-btn lp-btn-outline lp-btn-large">
              See Features
            </a>
          </div>
          <p className="hero-price">
            Free to start. Upgrade from <strong>$4.99/week</strong> when
            you&apos;re ready.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features">
        <div className="lp-container">
          <div className="section-title">
            <h2>Everything a tradie needs</h2>
            <p>
              Stop juggling spreadsheets, paper forms, and five different apps.
              BossBoard puts it all in one place.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">{'\u{1F6E1}'}</div>
              <h3>Compliance Made Easy</h3>
              <p>
                Generate Safe Work Method Statements with one tap. AI-powered
                hazard identification for your trade. Built to Health and
                Safety at Work Act 2015 standards — you stay the PCBU.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">{'\u{1F4CB}'}</div>
              <h3>Professional Invoicing</h3>
              <p>
                Create and send invoices on the spot. Track payments, chase
                overdue invoices, and see your revenue at a glance. GST built
                in.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">{'\u{1F4DD}'}</div>
              <h3>Quotes &amp; Estimates</h3>
              <p>
                Build professional quotes on site. Convert accepted quotes to
                invoices with one tap. Track quote status from sent to
                accepted.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">{'\u{1F477}'}</div>
              <h3>Team Management</h3>
              <p>
                Manage your crew, assign jobs, track who&apos;s where. Invite
                team members, set roles, and keep everyone on the same page.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">{'\u{1F4F7}'}</div>
              <h3>Photo Documentation</h3>
              <p>
                Snap photos of work before, during, and after. Attached to
                jobs, invoices, and SWMS automatically. GPS tagged for proof of
                work.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">{'\u{23F0}'}</div>
              <h3>Job Logging &amp; Time Tracking</h3>
              <p>
                Clock in and out of jobs. Track hours per site, per worker.
                Full audit trail for billing and compliance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ background: 'rgba(124,58,237,0.03)' }}>
        <div className="lp-container">
          <div className="section-title">
            <h2>Less than a coffee a week</h2>
            <p>Simple pricing. No contracts. Cancel anytime.</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card">
              <div className="price-name">Free</div>
              <div className="price-amount">$0</div>
              <div className="price-period">to get started</div>
              <ul className="price-features">
                <li>3 invoices per month</li>
                <li>2 SWMS per month</li>
                <li>Basic dashboard</li>
                <li>Photo documentation</li>
                <li>Single user</li>
              </ul>
              <Link
                href="/register"
                className="lp-btn lp-btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Get Started
              </Link>
            </div>
            <div className="price-card featured">
              <div className="price-name">Tradie</div>
              <div className="price-amount">
                $4.99<span>/week</span>
              </div>
              <div className="price-period">~$19.99/month</div>
              <ul className="price-features">
                <li>Unlimited invoices &amp; quotes</li>
                <li>Unlimited SWMS</li>
                <li>AI hazard identification</li>
                <li>PDF exports</li>
                <li>Email invoices</li>
                <li>Expense tracking</li>
                <li>Certification reminders</li>
                <li>Job logging &amp; time tracking</li>
              </ul>
              <Link
                href="/register"
                className="lp-btn lp-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Start Free
              </Link>
            </div>
            <div className="price-card">
              <div className="price-name">Team</div>
              <div className="price-amount">
                $9.99<span>/week</span>
              </div>
              <div className="price-period">~$39.99/month</div>
              <ul className="price-features">
                <li>Everything in Tradie</li>
                <li>Up to 5 team members</li>
                <li>Team roles &amp; permissions</li>
              </ul>
              <Link
                href="/register"
                className="lp-btn lp-btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Start Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* NZ Section */}
      <section id="nz" className="nz-section">
        <div className="lp-container">
          <div className="section-title">
            <h2>Built for Aotearoa</h2>
            <p>
              Not another US app with NZ bolted on. BossBoard is designed from
              the ground up for how Kiwi tradies actually work.
            </p>
          </div>
          <div className="nz-grid">
            <div className="nz-item">
              <div className="icon">{'\u{1F3D7}'}</div>
              <div>
                <h4>Built to WorkSafe NZ standards</h4>
                <p>
                  SWMS templates aligned to Health and Safety at Work Act 2015
                  — operator signs off.
                </p>
              </div>
            </div>
            <div className="nz-item">
              <div className="icon">{'\u{1F4B0}'}</div>
              <div>
                <h4>GST Built In</h4>
                <p>
                  15% GST calculated automatically on every invoice and quote.
                </p>
              </div>
            </div>
            <div className="nz-item">
              <div className="icon">{'\u{1F4F6}'}</div>
              <div>
                <h4>Works Offline</h4>
                <p>
                  No signal on the job site? No worries. BossBoard works
                  offline and syncs when you&apos;re back online.
                </p>
              </div>
            </div>
            <div className="nz-item">
              <div className="icon">{'\u{1F4B2}'}</div>
              <div>
                <h4>NZD Pricing</h4>
                <p>
                  No currency conversion surprises. Pay in NZ dollars, priced
                  for NZ businesses.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="lp-container">
          <h2>Ready to run your business like a boss?</h2>
          <p>Join early Kiwi tradies in beta who are ditching the paperwork.</p>
          <Link href="/register" className="lp-btn lp-btn-primary lp-btn-large">
            Start Free Today
          </Link>
          <p
            style={{
              marginTop: '16px',
              fontSize: '14px',
              color: 'var(--lp-text-muted)',
            }}
          >
            No credit card required. Get started in under a minute.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a
              href="https://instilligent.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Instilligent
            </a>
            <a href="mailto:support@instilligent.com">Contact</a>
            <a
              href="https://api.instilligent.com/legal/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy
            </a>
            <a
              href="https://api.instilligent.com/legal/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms
            </a>
          </div>
          <p>
            BossBoard is a product of{' '}
            <a
              href="https://instilligent.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Instilligent Limited
            </a>{' '}
            | NZBN 9429051598102 | New Zealand
          </p>
        </div>
      </footer>
    </div>
  );
}
