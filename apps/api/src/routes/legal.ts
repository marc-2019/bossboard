/**
 * Legal Routes (No Authentication Required)
 * Serves HTML pages required for App Store / Play Store compliance.
 *
 * GET /privacy        - Privacy Policy
 * GET /terms          - Terms of Service
 * GET /support        - Support / Contact
 * GET /delete-account - Account Deletion Request
 * GET /delete-data    - Data Deletion Request
 */

import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';

const router = Router();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ROUTES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/privacy', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPrivacyPolicy());
});

router.get('/terms', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderTermsOfService());
});

router.get('/support', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderSupportPage());
});

router.get('/delete-account', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderDeleteAccountPage());
});

router.get('/delete-data', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderDeleteDataPage());
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HTML HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function esc(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Shared page wrapper */
function page(title: string, body: string): string {
  const appName = esc(config.appName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} - ${appName}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="/legal/privacy" class="brand">${appName}</a>
      <nav>
        <a href="/legal/privacy">Privacy</a>
        <a href="/legal/terms">Terms</a>
        <a href="/legal/support">Support</a>
        <a href="/legal/delete-account">Delete Account</a>
      </nav>
    </div>
  </header>
  <main class="container">
    <div class="card">
      ${body}
    </div>
  </main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p>&copy; ${new Date().getFullYear()} Instilligent Limited. All rights reserved.</p>
      <p class="footer-links">
        <a href="/legal/privacy">Privacy Policy</a>
        <a href="/legal/terms">Terms of Service</a>
        <a href="/legal/support">Support</a>
        <a href="/legal/delete-account">Delete Account</a>
      </p>
    </div>
  </footer>
</body>
</html>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PRIVACY POLICY
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderPrivacyPolicy(): string {
  const appName = esc(config.appName);

  return page('Privacy Policy', `
      <h1>Privacy Policy</h1>
      <p class="meta">Effective Date: 24 March 2026 &middot; Last Updated: 17 July 2026</p>

      <p>
        <strong>Instilligent Limited</strong> (NZBN 9429041896853), trading as <strong>${appName}</strong>
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), operates the
        ${appName} mobile application and associated services (the &ldquo;Service&rdquo;). This Privacy
        Policy explains how we collect, use, disclose, and safeguard your information when you use our
        Service. We are committed to compliance with the
        <strong>New Zealand Privacy Act 2020</strong> and its Information Privacy Principles (IPPs).
      </p>

      <h2>1. Information We Collect <small>(IPP 1&ndash;4)</small></h2>
      <p>Under IPP 1 (Purpose of Collection) and IPP 3 (Collection from Subject), we only collect personal information that is necessary for providing our services, and we collect it directly from you wherever possible.</p>

      <h3>1.1 Information You Provide</h3>
      <ul>
        <li><strong>Account information</strong> &ndash; name, email address, phone number, and password when you register.</li>
        <li><strong>Business information</strong> &ndash; company name, trade type, GST number, business address, and bank account details for invoicing.</li>
        <li><strong>Financial data</strong> &ndash; invoices, quotes, expenses, and payment records you create within the Service.</li>
        <li><strong>Compliance documents</strong> &ndash; Safe Work Method Statements (SWMS), risk assessments, and certification details.</li>
        <li><strong>Job and site information</strong> &ndash; job logs, site addresses, clock-in/out times, and job descriptions.</li>
        <li><strong>Customer data</strong> &ndash; names, email addresses, phone numbers, and addresses of your clients that you enter.</li>
        <li><strong>Photos</strong> &ndash; images you upload for job documentation, receipts, or certifications.</li>
      </ul>

      <h3>1.2 Information Collected Automatically</h3>
      <ul>
        <li><strong>Device information</strong> &ndash; device type, operating system, unique device identifiers, and mobile network information.</li>
        <li><strong>Usage data</strong> &ndash; features accessed, screens viewed, and interaction patterns to improve the Service.</li>
        <li><strong>Push notification tokens</strong> &ndash; device tokens used to deliver push notifications you have opted into.</li>
        <li><strong>Location (approximate and/or precise)</strong> &ndash; when you explicitly grant permission while using the app, for pre-filling site addresses on job logs and SWMS. Location is requested while the app is in use (not continuous background tracking for advertising). You can refuse or revoke permission in system settings; related fields remain manually editable.</li>
      </ul>

      <h2>2. How We Use Your Information <small>(IPP 10)</small></h2>
      <p>Under IPP 10 (Limits on Use), we use personal information only for the purpose for which it was collected or a directly related purpose:</p>
      <ul>
        <li>Provide, operate, and maintain the Service, including generating invoices, quotes, and compliance documents.</li>
        <li>Generate AI-powered compliance documentation (SWMS, hazard suggestions, control measures) using the Anthropic Claude API.</li>
        <li>Send push notifications for certification expiry reminders, invoice updates, and team invitations.</li>
        <li>Process subscription billing and manage your account.</li>
        <li>Generate business insights, dashboard statistics, and revenue reports.</li>
        <li>Communicate with you about updates, security alerts, and support matters.</li>
        <li>Detect, prevent, and address technical issues and security threats.</li>
        <li>Comply with legal obligations under New Zealand law.</li>
      </ul>

      <h2>3. AI-Powered Features <small>(third-party AI &mdash; limited use)</small></h2>
      <p>${appName} uses the Anthropic Claude API to generate compliance documents such as Safe Work Method Statements. This is <strong>limited use</strong> only for the document you requested &mdash; not for advertising, not for selling data, and not for training public foundation models under our control.</p>
      <ul>
        <li>When you enable <strong>AI-Powered Generation</strong> (in-app toggle) and generate a SWMS, relevant job details you entered (trade type, job description, site details) are sent via our API to Anthropic.</li>
        <li>Turning the toggle <strong>off</strong> uses template hazards only and does <strong>not</strong> call the third-party AI path for that request. Using the feature with the toggle on is your consent to that limited processing.</li>
        <li>We do not send your password or payment card numbers to the AI service.</li>
        <li>AI-generated content is suggestions only and must be reviewed and customised by you before use on site.</li>
        <li>Anthropic processes the request under their commercial API terms as our processor; they do not use your data to train models under our commercial agreement.</li>
      </ul>

      <h2>4. Data Sharing and Disclosure <small>(IPP 11)</small></h2>
      <p>Under IPP 11 (Limits on Disclosure), we do not sell, rent, or trade your personal information. We share data with the following providers:</p>

      <table class="data-table">
        <thead><tr><th>Provider</th><th>Purpose</th><th>Data Shared</th><th>Location</th></tr></thead>
        <tbody>
          <tr><td><strong>Railway</strong></td><td>Application hosting &amp; database</td><td>All platform data</td><td>Asia-SE (Singapore)</td></tr>
          <tr><td><strong>Anthropic (Claude API)</strong></td><td>AI document generation</td><td>Trade type, job descriptions (no PII)</td><td>United States</td></tr>
          <tr><td><strong>Expo</strong></td><td>Push notifications</td><td>Device push tokens</td><td>United States</td></tr>
          <tr><td><strong>Stripe</strong></td><td>Payment processing</td><td>Name, email, billing address, card data</td><td>United States</td></tr>
          <tr><td><strong>Email providers</strong></td><td>Invoice &amp; account emails</td><td>Email address, invoice content</td><td>United States</td></tr>
        </tbody>
      </table>

      <p>We may also share data with:</p>
      <ul>
        <li><strong>Your clients</strong> &ndash; when you share an invoice via a public link or email.</li>
        <li><strong>Team members</strong> &ndash; if you use team features, as configured by the team owner.</li>
        <li><strong>Law enforcement</strong> &ndash; when required by law or to protect the rights, property, or safety of our users.</li>
      </ul>

      <h2>5. Overseas Disclosure of Personal Information <small>(IPP 12)</small></h2>
      <p>Under IPP 12 of the Privacy Act 2020, before disclosing personal information to a foreign person or entity, we must either believe on reasonable grounds that the recipient is subject to comparable privacy protections, or obtain your express authorisation.</p>
      <p>Your personal information is hosted in <strong>Singapore</strong> by Railway (Asia-Southeast region). Some data is also processed in the <strong>United States</strong> by Anthropic (AI features), Stripe (payments), and Expo (push notifications).</p>
      <p>Singapore has the Personal Data Protection Act 2012 (PDPA), which provides broadly comparable privacy protections. The United States does not have equivalent comprehensive privacy legislation at the federal level.</p>
      <p>We mitigate risks through contractual data processing agreements with all overseas providers, minimising the personal information transferred, encrypting all data in transit (TLS 1.2+) and at rest, and selecting providers with robust security certifications (PCI DSS for Stripe).</p>
      <p>By using the Service, you acknowledge and consent to the transfer of your personal information to Singapore and the United States for the purposes described in this policy. You may withdraw consent by deleting your account.</p>

      <h2>6. Data Storage and Security <small>(IPP 5)</small></h2>
      <p>Under IPP 5 (Storage and Security), we implement appropriate measures to protect your personal information:</p>
      <ul>
        <li>Data is stored on secure Railway infrastructure in Singapore (Asia-Southeast).</li>
        <li>All data is transmitted using TLS 1.2+ encryption (HTTPS).</li>
        <li>Passwords are hashed using bcrypt and never stored in plain text.</li>
        <li>Database access is restricted by authentication credentials and network security controls.</li>
        <li>We conduct regular reviews of our data collection, storage, and processing practices.</li>
      </ul>

      <h2>7. Data Retention <small>(IPP 9)</small></h2>
      <p>Under IPP 9 (Retention), we do not keep personal information for longer than is necessary.</p>

      <table class="data-table">
        <thead><tr><th>Data Type</th><th>Retention Period</th></tr></thead>
        <tbody>
          <tr><td>Active account data</td><td>Duration of subscription + 60 days</td></tr>
          <tr><td>Job records, quotes, invoices</td><td>7 years after creation (tax/legal)</td></tr>
          <tr><td>SWMS documents</td><td>7 years (health &amp; safety requirement)</td></tr>
          <tr><td>Payment records</td><td>7 years (Tax Administration Act 1994)</td></tr>
          <tr><td>Support communications</td><td>2 years after resolution</td></tr>
          <tr><td>Usage/analytics data</td><td>12 months</td></tr>
        </tbody>
      </table>

      <p>After account deletion, we retain data for 60 days to allow for export, then securely delete it (except records legally required to be retained).</p>

      <h2>8. Your Rights <small>(IPP 6&ndash;7)</small></h2>
      <p>Under the Privacy Act 2020, you have the right to:</p>
      <ul>
        <li><strong>Access (IPP 6)</strong> &ndash; request a copy of the personal information we hold about you. We will respond within 20 working days.</li>
        <li><strong>Correction (IPP 7)</strong> &ndash; ask us to correct any inaccurate or incomplete personal information.</li>
        <li><strong>Deletion</strong> &ndash; request deletion of your personal information, subject to legal retention requirements.</li>
        <li><strong>Data export</strong> &ndash; export your data at any time through the Service.</li>
        <li><strong>Complaint</strong> &ndash; lodge a complaint with the <a href="https://www.privacy.org.nz" target="_blank" rel="noopener">Office of the Privacy Commissioner</a>.</li>
      </ul>
      <p>To exercise any of these rights, contact us at <a href="mailto:privacy@instilligent.com">privacy@instilligent.com</a>. We will respond within 20 working days as required by the Act.</p>

      <h2>9. Your Client and Worker Data</h2>
      <p>When you enter client contact details, worker names (in SWMS), or other third-party information into the Service, you are the controller of that information. You are responsible for ensuring you have the right to enter that information, informing your clients and workers, and responding to any access or correction requests from those individuals.</p>

      <h2>10. Cookies and Local Storage</h2>
      <p>The mobile app uses local device storage for session management and user preferences. The web application uses essential cookies for authentication and session management. No third-party advertising or tracking cookies are used.</p>

      <h2>11. Children&rsquo;s Privacy</h2>
      <p>The Service is designed for business and trade use and is not directed at individuals under the age of 18. We do not knowingly collect personal information from children.</p>

      <h2>12. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy within the app and, where appropriate, sending you a push notification or email at least 14 days before they take effect.</p>

      <h2>13. Contact Us</h2>
      <div class="contact-box">
        <p><strong>Instilligent Limited</strong></p>
        <p>Trading as ${appName}</p>
        <p>NZBN: 9429041896853</p>
        <p>Auckland, New Zealand</p>
        <p>Email: <a href="mailto:privacy@instilligent.com">privacy@instilligent.com</a></p>
        <p style="margin-top:0.5rem;"><strong>Privacy Commissioner (NZ):</strong> <a href="https://www.privacy.org.nz" target="_blank" rel="noopener">www.privacy.org.nz</a></p>
      </div>
  `);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TERMS OF SERVICE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderTermsOfService(): string {
  const appName = esc(config.appName);

  return page('Terms of Service', `
      <h1>Terms of Service</h1>
      <p class="meta">Effective Date: 1 February 2026 &middot; Last Updated: February 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the ${appName} mobile
        application and associated services (the &ldquo;Service&rdquo;) operated by Instilligent
        Limited (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), a company registered
        in New Zealand.
      </p>
      <p>
        By creating an account or using the Service, you agree to be bound by these Terms. If you do
        not agree, please do not use the Service.
      </p>

      <h2>1. Service Description</h2>
      <p>${appName} is a mobile application designed for New Zealand tradespeople and small service businesses. The Service includes:</p>
      <ul>
        <li>Business management tools &ndash; invoicing, quoting, expense tracking, and job logging.</li>
        <li>Compliance documentation &ndash; AI-assisted generation of Safe Work Method Statements (SWMS), risk assessments, and safety checklists.</li>
        <li>Certification tracking &ndash; trade licence and certification expiry monitoring with reminders.</li>
        <li>Team management &ndash; inviting team members, role assignment, and shared access to business data.</li>
        <li>Client portal &ndash; shareable invoice links for your customers.</li>
        <li>Dashboard and insights &ndash; revenue reporting, outstanding invoice tracking, and business analytics.</li>
      </ul>

      <h2>2. Account Registration</h2>
      <ul>
        <li>You must be at least 16 years old to create an account.</li>
        <li>You must provide accurate, complete, and current information during registration.</li>
        <li>You are responsible for maintaining the confidentiality of your password and for all activities under your account.</li>
        <li>You must notify us immediately of any unauthorised use of your account.</li>
        <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
      </ul>

      <h2>3. Subscription Tiers and Pricing</h2>
      <p>${appName} offers the following subscription tiers (prices in NZD, inclusive of GST):</p>
      <table class="pricing-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Price</th>
            <th>Includes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Free</strong></td>
            <td>$0</td>
            <td>3 invoices/month, 2 SWMS/month, basic dashboard</td>
          </tr>
          <tr>
            <td><strong>Tradie</strong></td>
            <td>$4.99/week (~$19.99/month)</td>
            <td>Unlimited invoices, SWMS, quotes, expenses, job logs, PDF export, email invoices, photos</td>
          </tr>
          <tr>
            <td><strong>Team</strong></td>
            <td>$9.99/week (~$39.99/month)</td>
            <td>Everything in Tradie + up to 5 team members, team management, shared data</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Beta Programme:</strong> During the beta period, all users receive Tradie-tier access
        at no charge. We will provide at least 14 days&rsquo; notice before the beta period ends and
        paid subscriptions commence.
      </p>
      <p>
        Subscription payments are processed by Stripe. By subscribing to a paid tier, you agree to
        Stripe&rsquo;s terms of service. You may cancel your subscription at any time; access
        continues until the end of the current billing period.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of New Zealand law.</li>
        <li>Submit false, misleading, or fraudulent information.</li>
        <li>Attempt to gain unauthorised access to the Service, other accounts, or our systems.</li>
        <li>Use automated tools (bots, scrapers) to access the Service without our written consent.</li>
        <li>Interfere with or disrupt the integrity or performance of the Service.</li>
        <li>Upload malicious code, viruses, or harmful content.</li>
        <li>Use the Service to send spam or unsolicited communications.</li>
        <li>Resell, redistribute, or sublicence the Service without our written consent.</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <ul>
        <li>The Service, including its design, code, features, and content, is the intellectual property of Instilligent Limited and is protected by New Zealand and international intellectual property laws.</li>
        <li>You retain ownership of the data you enter into the Service (invoices, documents, photos, etc.).</li>
        <li>By using the Service, you grant us a limited licence to process your data solely for the purpose of providing the Service.</li>
        <li>You may not copy, modify, reverse-engineer, or create derivative works from the Service.</li>
      </ul>

      <h2>6. AI-Generated Content Disclaimer</h2>
      <div class="disclaimer-box">
        <p>
          <strong>Important:</strong> ${appName} uses artificial intelligence (the Anthropic Claude API)
          to assist in generating compliance documents such as Safe Work Method Statements (SWMS),
          hazard suggestions, and control measures.
        </p>
        <p>
          AI-generated content is provided as <strong>suggestions only</strong> and does not constitute
          legal, safety, or professional advice. You are solely responsible for reviewing, verifying,
          and approving all AI-generated content before use. We strongly recommend having compliance
          documents reviewed by a qualified health and safety professional.
        </p>
        <p>
          Instilligent Limited does not warrant that AI-generated content is accurate, complete, or
          suitable for any particular purpose. We accept no liability for any loss or damage arising
          from reliance on AI-generated content.
        </p>
      </div>

      <h2>7. Limitation of Liability</h2>
      <p>To the maximum extent permitted by New Zealand law:</p>
      <ul>
        <li>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied.</li>
        <li>We do not warrant that the Service will be uninterrupted, error-free, or secure.</li>
        <li>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</li>
        <li>Our total liability for any claim relating to the Service shall not exceed the amount you have paid us in the 12 months preceding the claim.</li>
      </ul>

      <h2>8. Consumer Guarantees Act</h2>
      <p>
        Nothing in these Terms is intended to limit your rights under the
        <strong>New Zealand Consumer Guarantees Act 1993</strong>. Where the Consumer Guarantees Act
        applies, the Service must be provided with reasonable care and skill, be fit for its intended
        purpose, and comply with any description provided.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Instilligent Limited, its directors, employees, and
        agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising
        from your use of the Service, your violation of these Terms, or your violation of any
        third-party rights.
      </p>

      <h2>10. Dispute Resolution</h2>
      <ul>
        <li>These Terms are governed by the laws of New Zealand.</li>
        <li>Any disputes shall first be addressed through good-faith negotiation between the parties.</li>
        <li>If a dispute cannot be resolved through negotiation within 30 days, either party may refer the matter to mediation administered in accordance with the Arbitrators&rsquo; and Mediators&rsquo; Institute of New Zealand (AMINZ) Mediation Protocol.</li>
        <li>The courts of New Zealand shall have exclusive jurisdiction over any dispute that cannot be resolved through mediation.</li>
      </ul>

      <h2>11. Termination</h2>
      <ul>
        <li>You may delete your account at any time through the app settings or by contacting us.</li>
        <li>We may suspend or terminate your account if you breach these Terms, with notice where practicable.</li>
        <li>Upon termination, your right to use the Service ceases immediately.</li>
        <li>You may request a copy of your data within 30 days of termination. After 90 days, your data will be deleted in accordance with our Privacy Policy.</li>
      </ul>

      <h2>12. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you of material changes by
        posting the updated Terms within the app and, where appropriate, via email or push
        notification. Continued use of the Service after changes are posted constitutes acceptance
        of the updated Terms.
      </p>

      <h2>13. Contact Us</h2>
      <div class="contact-box">
        <p><strong>Legal Enquiries</strong></p>
        <p>Instilligent Limited</p>
        <p>New Zealand</p>
        <p>Email: <a href="mailto:legal@instilligent.com">legal@instilligent.com</a></p>
      </div>
  `);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SUPPORT / CONTACT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderSupportPage(): string {
  const appName = esc(config.appName);

  return page('Support', `
      <h1>Support &amp; Contact</h1>
      <p class="meta">We&rsquo;re here to help you get the most out of ${appName}.</p>

      <div class="support-grid">

        <div class="support-card">
          <div class="support-icon">&#9993;</div>
          <h3>Email Support</h3>
          <p>
            For general enquiries, account issues, or anything else, email us at:
          </p>
          <p class="support-email">
            <a href="mailto:support@instilligent.com">support@instilligent.com</a>
          </p>
          <p class="support-note">We aim to respond within <strong>2 business days</strong>.</p>
        </div>

        <div class="support-card">
          <div class="support-icon">&#128027;</div>
          <h3>Report a Bug</h3>
          <p>Found something that doesn&rsquo;t work as expected? Please include:</p>
          <ul>
            <li>A description of what happened and what you expected.</li>
            <li>The screen or feature where the issue occurred.</li>
            <li>Your device type and operating system version.</li>
            <li>Screenshots if possible.</li>
          </ul>
          <p>
            Send bug reports to
            <a href="mailto:support@instilligent.com?subject=Bug%20Report">support@instilligent.com</a>
            with the subject line &ldquo;Bug Report&rdquo;.
          </p>
        </div>

        <div class="support-card">
          <div class="support-icon">&#128161;</div>
          <h3>Feature Requests</h3>
          <p>
            Have an idea that would make ${appName} more useful for your trade? We genuinely want
            to hear it. Email us at
            <a href="mailto:support@instilligent.com?subject=Feature%20Request">support@instilligent.com</a>
            with the subject line &ldquo;Feature Request&rdquo;.
          </p>
          <p class="support-note">
            We review every request and prioritise based on demand and impact.
          </p>
        </div>

      </div>

      <h2>Frequently Asked Questions</h2>

      <div class="faq-list">

        <details class="faq-item">
          <summary>What is ${appName}?</summary>
          <p>
            ${appName} is a mobile app built specifically for New Zealand tradespeople and small
            service businesses. It brings together invoicing, quoting, expense tracking, job logging,
            compliance documentation (SWMS), certification tracking, and team management in one
            affordable, easy-to-use app.
          </p>
        </details>

        <details class="faq-item">
          <summary>Is ${appName} free?</summary>
          <p>
            ${appName} offers a free tier with basic features (3 invoices and 2 SWMS per month).
            Paid tiers start at $4.99 NZD per week for unlimited access. During the current beta
            period, all features are available to all users at no charge.
          </p>
        </details>

        <details class="faq-item">
          <summary>Does the app work offline?</summary>
          <p>
            Yes. ${appName} is designed with an offline-first approach. You can create invoices,
            log jobs, and manage your business data without an internet connection. Data
            automatically syncs when you&rsquo;re back online.
          </p>
        </details>

        <details class="faq-item">
          <summary>How are my SWMS documents generated?</summary>
          <p>
            ${appName} uses AI (powered by the Anthropic Claude API) to generate Safe Work Method
            Statements based on your trade type and job description. The generated documents are
            suggestions and should always be reviewed and customised for your specific worksite
            before use.
          </p>
        </details>

        <details class="faq-item">
          <summary>Is my data secure?</summary>
          <p>
            Yes. We use industry-standard encryption for data in transit (TLS/HTTPS) and at rest.
            Passwords are securely hashed and never stored in plain text. See our
            <a href="/privacy">Privacy Policy</a> for full details.
          </p>
        </details>

        <details class="faq-item">
          <summary>Can I use ${appName} with my team?</summary>
          <p>
            Yes. The Team tier ($9.99 NZD/week) supports up to 5 team members. You can invite
            members, assign roles (owner, admin, worker), and share business data across your team.
          </p>
        </details>

        <details class="faq-item">
          <summary>How do I cancel my subscription?</summary>
          <p>
            You can manage your subscription from the Settings screen in the app. If you cancel,
            you&rsquo;ll continue to have access until the end of your current billing period.
            You can also contact us at
            <a href="mailto:support@instilligent.com">support@instilligent.com</a> for assistance.
          </p>
        </details>

        <details class="faq-item">
          <summary>How do I delete my account?</summary>
          <p>
            You can request account deletion by emailing
            <a href="mailto:support@instilligent.com?subject=Account%20Deletion%20Request">support@instilligent.com</a>
            with the subject &ldquo;Account Deletion Request&rdquo;. We will process your request
            and confirm deletion within 20 working days. You may also request a copy of your data
            before deletion.
          </p>
        </details>

        <details class="faq-item">
          <summary>What New Zealand regulations does ${appName} support?</summary>
          <p>
            ${appName} is designed to help you comply with the Health and Safety at Work Act 2015,
            WorkSafe NZ guidelines, and PCBU (Person Conducting a Business or Undertaking) duties.
            Certification tracking helps you stay on top of trade licence renewals and other
            regulatory requirements.
          </p>
        </details>

        <details class="faq-item">
          <summary>I have a billing question. Who do I contact?</summary>
          <p>
            For any billing or payment enquiries, email us at
            <a href="mailto:support@instilligent.com?subject=Billing%20Enquiry">support@instilligent.com</a>
            with the subject &ldquo;Billing Enquiry&rdquo;. Please include the email address
            associated with your account.
          </p>
        </details>

      </div>

      <h2>About Us</h2>
      <div class="contact-box">
        <p><strong>Instilligent Limited</strong></p>
        <p>New Zealand</p>
        <p>Email: <a href="mailto:support@instilligent.com">support@instilligent.com</a></p>
      </div>
  `);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ACCOUNT DELETION REQUEST
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderDeleteAccountPage(): string {
  const appName = esc(config.appName);

  return page('Account Deletion Request', `
      <h1>Account Deletion Request</h1>
      <p class="meta">How to request permanent deletion of your ${appName} account and associated data.</p>

      <p>
        Under the <strong>New Zealand Privacy Act 2020</strong>, you have the right to request deletion
        of your personal information. This page explains how to request complete deletion of your
        ${appName} account and all associated data.
      </p>

      <h2>How to Request Account Deletion</h2>
      <p>To delete your account, follow these three steps:</p>

      <ol class="steps-list">
        <li>
          <div class="step-content">
            <strong>Send a deletion request</strong>
            <p>
              Email <a href="mailto:support@instilligent.com?subject=Account%20Deletion%20Request">support@instilligent.com</a>
              with the subject line <strong>&ldquo;Account Deletion Request&rdquo;</strong>. Include the
              email address associated with your ${appName} account so we can locate your records.
            </p>
          </div>
        </li>
        <li>
          <div class="step-content">
            <strong>Identity verification</strong>
            <p>
              We will reply to confirm your identity before processing the request. This protects your
              account from unauthorised deletion. You may be asked to confirm details such as the email
              address or trade type on your account.
            </p>
          </div>
        </li>
        <li>
          <div class="step-content">
            <strong>Processing &amp; confirmation</strong>
            <p>
              Once verified, we will process your deletion request within <strong>20 working days</strong>,
              as required by the NZ Privacy Act 2020. You will receive a confirmation email when deletion
              is complete.
            </p>
          </div>
        </li>
      </ol>

      <h2>What Gets Deleted</h2>
      <p>When your account is deleted, the following data is permanently removed:</p>
      <ul>
        <li><strong>Account information</strong> &ndash; your name, email address, phone number, password, and profile settings.</li>
        <li><strong>Business data</strong> &ndash; invoices, quotes, expenses, and job logs you created.</li>
        <li><strong>Compliance documents</strong> &ndash; Safe Work Method Statements (SWMS), risk assessments, and generated documents.</li>
        <li><strong>Certifications</strong> &ndash; trade licences, certification records, and expiry tracking data.</li>
        <li><strong>Photos</strong> &ndash; all uploaded images (job photos, receipts, certification images).</li>
        <li><strong>Team data</strong> &ndash; team memberships, invitations, and role assignments. If you are a team owner, the team will be dissolved.</li>
        <li><strong>Customer records</strong> &ndash; client names, contact details, and associated invoice/quote history.</li>
      </ul>

      <h2>Data Retention Requirements</h2>
      <div class="disclaimer-box">
        <p>
          <strong>Important:</strong> Certain financial records may be retained for up to
          <strong>7 years</strong> after deletion as required by the
          <strong>Tax Administration Act 1994</strong>. This includes invoice amounts, GST records,
          and expense totals needed for tax compliance purposes. Retained records are anonymised
          where possible and are not accessible through the Service.
        </p>
      </div>

      <h2>Before You Delete</h2>
      <ul>
        <li>Account deletion is <strong>permanent and cannot be undone</strong>. Once processed, your data cannot be recovered.</li>
        <li>If you have an active paid subscription, please cancel it before requesting deletion to avoid further charges.</li>
        <li>You may request a copy of your data before deletion by including this in your email.</li>
        <li>If you only want to delete specific data without removing your entire account, see our <a href="/legal/delete-data">Data Deletion Request</a> page instead.</li>
      </ul>

      <h2>Contact Us</h2>
      <div class="contact-box">
        <p><strong>Account Deletion Requests</strong></p>
        <p>Instilligent Limited</p>
        <p>Email: <a href="mailto:support@instilligent.com?subject=Account%20Deletion%20Request">support@instilligent.com</a></p>
        <p class="support-note">Subject: &ldquo;Account Deletion Request&rdquo;</p>
      </div>
  `);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DATA DELETION REQUEST
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderDeleteDataPage(): string {
  const appName = esc(config.appName);

  return page('Data Deletion Request', `
      <h1>Data Deletion Request</h1>
      <p class="meta">How to request deletion of specific data from your ${appName} account without deleting the account itself.</p>

      <p>
        Under the <strong>New Zealand Privacy Act 2020</strong>, you have the right to request deletion
        of personal information held about you. If you want to remove specific data from your account
        while keeping your ${appName} account active, this page explains how.
      </p>

      <h2>How to Request Data Deletion</h2>
      <p>To request deletion of specific data, follow these steps:</p>

      <ol class="steps-list">
        <li>
          <div class="step-content">
            <strong>Send a data deletion request</strong>
            <p>
              Email <a href="mailto:support@instilligent.com?subject=Data%20Deletion%20Request">support@instilligent.com</a>
              with the subject line <strong>&ldquo;Data Deletion Request&rdquo;</strong>. Include the
              email address associated with your account and clearly describe which data you want deleted.
            </p>
          </div>
        </li>
        <li>
          <div class="step-content">
            <strong>Identity verification</strong>
            <p>
              We will reply to verify your identity before processing the request. This ensures only
              you can request changes to your data.
            </p>
          </div>
        </li>
        <li>
          <div class="step-content">
            <strong>Processing &amp; confirmation</strong>
            <p>
              Once verified, we will delete the specified data within <strong>20 working days</strong>,
              as required by the NZ Privacy Act 2020. You will receive a confirmation email when the
              deletion is complete.
            </p>
          </div>
        </li>
      </ol>

      <h2>Data That Can Be Deleted</h2>
      <p>You can request deletion of any of the following data types individually:</p>
      <ul>
        <li><strong>Invoices</strong> &ndash; specific invoices or all invoice history.</li>
        <li><strong>Quotes</strong> &ndash; specific quotes or all quote history.</li>
        <li><strong>Expenses</strong> &ndash; specific expense records or all expenses.</li>
        <li><strong>Job logs</strong> &ndash; specific job records or all job history.</li>
        <li><strong>Compliance documents</strong> &ndash; specific SWMS documents or all compliance records.</li>
        <li><strong>Certifications</strong> &ndash; specific certification records or all certification data.</li>
        <li><strong>Photos</strong> &ndash; specific uploaded images or all photos.</li>
        <li><strong>Customer records</strong> &ndash; specific client details or all customer data.</li>
        <li><strong>Business information</strong> &ndash; company name, GST number, bank details, or business address.</li>
      </ul>

      <h2>Data Retention Requirements</h2>
      <div class="disclaimer-box">
        <p>
          <strong>Important:</strong> Some data may be subject to mandatory retention periods under
          New Zealand law. In particular, financial records (invoice amounts, GST records, expense
          totals) may need to be retained for up to <strong>7 years</strong> as required by the
          <strong>Tax Administration Act 1994</strong>. Where retention is required, the data will
          be anonymised where possible and will not be accessible through the Service.
        </p>
        <p>
          We will inform you if any part of your request is subject to a retention requirement and
          explain how the retained data will be handled.
        </p>
      </div>

      <h2>Full Account Deletion</h2>
      <p>
        If you want to delete your entire account and all associated data instead, visit our
        <a href="/legal/delete-account">Account Deletion Request</a> page for instructions.
      </p>

      <h2>Contact Us</h2>
      <div class="contact-box">
        <p><strong>Data Deletion Requests</strong></p>
        <p>Instilligent Limited</p>
        <p>Email: <a href="mailto:support@instilligent.com?subject=Data%20Deletion%20Request">support@instilligent.com</a></p>
        <p class="support-note">Subject: &ldquo;Data Deletion Request&rdquo;</p>
      </div>
  `);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STYLES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F3F4F6;
      color: #111827;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .site-header {
      background: #1A2A44;
      color: #fff;
      padding: 0 16px;
    }
    .header-inner {
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .brand {
      font-weight: 700;
      font-size: 18px;
      color: #fff;
      text-decoration: none;
    }
    .site-header nav a {
      color: rgba(255,255,255,0.85);
      text-decoration: none;
      font-size: 14px;
      margin-left: 20px;
      transition: color 0.15s;
    }
    .site-header nav a:hover { color: #fff; }

    /* â”€â”€ Main container â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 16px 48px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 40px 36px;
    }

    /* â”€â”€ Typography â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1A2A44;
      margin-bottom: 8px;
    }
    .meta {
      color: #6B7280;
      font-size: 14px;
      margin-bottom: 32px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1A2A44;
      margin-top: 36px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #E5E7EB;
    }
    h3 {
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    p { margin-bottom: 12px; }
    ul {
      margin-bottom: 16px;
      padding-left: 24px;
    }
    li { margin-bottom: 6px; }
    a { color: #2563EB; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* â”€â”€ Contact box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .contact-box {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 20px 24px;
      margin-top: 12px;
    }
    .contact-box p { margin-bottom: 4px; }

    /* â”€â”€ Disclaimer box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .disclaimer-box {
      background: #FFFBEB;
      border: 1px solid #FCD34D;
      border-left: 4px solid #F59E0B;
      border-radius: 8px;
      padding: 20px 24px;
      margin-top: 12px;
    }

    /* â”€â”€ Pricing table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 20px;
      font-size: 14px;
    }
    .pricing-table th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      padding: 10px 12px;
      border-bottom: 2px solid #E5E7EB;
      background: #F9FAFB;
    }
    .pricing-table td {
      padding: 12px;
      border-bottom: 1px solid #F3F4F6;
      vertical-align: top;
    }

    /* â”€â”€ Support grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .support-grid {
      display: grid;
      gap: 20px;
      margin-top: 24px;
    }
    .support-card {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 24px;
    }
    .support-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }
    .support-card h3 {
      margin-top: 0;
      color: #1A2A44;
    }
    .support-email a {
      font-size: 18px;
      font-weight: 600;
      color: #2563EB;
    }
    .support-note {
      font-size: 13px;
      color: #6B7280;
      margin-bottom: 0;
    }
    .support-card ul {
      font-size: 14px;
      margin-bottom: 12px;
    }

    /* â”€â”€ FAQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .faq-list {
      margin-top: 16px;
    }
    .faq-item {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .faq-item summary {
      font-weight: 600;
      font-size: 15px;
      padding: 16px 20px;
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fff;
      transition: background 0.15s;
    }
    .faq-item summary:hover { background: #F9FAFB; }
    .faq-item summary::after {
      content: '+';
      font-size: 20px;
      font-weight: 300;
      color: #6B7280;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .faq-item[open] summary::after { content: '\\2212'; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item p {
      padding: 0 20px 16px;
      color: #374151;
      font-size: 14px;
      line-height: 1.6;
    }
    .faq-item ul {
      padding: 0 20px 16px 44px;
      font-size: 14px;
    }

    /* â”€â”€ Steps list (wizard-style numbered circles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .steps-list {
      list-style: none;
      padding-left: 0;
      counter-reset: step-counter;
      margin: 20px 0 24px;
    }
    .steps-list li {
      counter-increment: step-counter;
      display: flex;
      align-items: flex-start;
      margin-bottom: 20px;
      position: relative;
      padding-left: 56px;
      min-height: 44px;
    }
    .steps-list li::before {
      content: counter(step-counter);
      position: absolute;
      left: 0;
      top: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1A2A44;
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .steps-list li:not(:last-child)::after {
      content: '';
      position: absolute;
      left: 19px;
      top: 44px;
      bottom: -16px;
      width: 2px;
      background: #E5E7EB;
    }
    .step-content {
      padding-top: 8px;
    }
    .step-content strong {
      font-size: 16px;
      color: #1A2A44;
      display: block;
      margin-bottom: 4px;
    }
    .step-content p {
      font-size: 14px;
      color: #374151;
      margin-bottom: 0;
    }

    /* â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    .site-footer {
      border-top: 1px solid #E5E7EB;
      background: #fff;
      padding: 24px 16px;
      margin-top: 16px;
    }
    .footer-inner {
      max-width: 720px;
      margin: 0 auto;
      text-align: center;
      font-size: 13px;
      color: #9CA3AF;
    }
    .footer-links { margin-top: 8px; }
    .footer-links a {
      color: #6B7280;
      text-decoration: none;
      margin: 0 10px;
    }
    .footer-links a:hover { color: #2563EB; }

    /* â”€â”€ Responsive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    @media (max-width: 480px) {
      .container { padding: 20px 10px 36px; }
      .card { padding: 28px 20px; border-radius: 8px; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; }
      .header-inner { height: 48px; }
      .brand { font-size: 16px; }
      .site-header nav a { margin-left: 14px; font-size: 13px; }
      .pricing-table { font-size: 13px; }
      .pricing-table th, .pricing-table td { padding: 8px 6px; }
    }
  `;
}

export default router;
