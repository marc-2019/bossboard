# TradeMate NZ - App Store Submission Guide

**Version**: 1.0.0 | **Last Updated**: February 2026

This guide covers everything needed to submit TradeMate NZ to the Apple App Store and Google Play Store using Expo Application Services (EAS).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Apple App Store Submission](#apple-app-store-submission)
3. [Google Play Store Submission](#google-play-store-submission)
4. [App Store Listing Content](#app-store-listing-content)
5. [Screenshot Requirements](#screenshot-requirements)
6. [Privacy Policy Requirements](#privacy-policy-requirements)
7. [Build and Submit Commands](#build-and-submit-commands)
8. [Common Rejection Reasons](#common-rejection-reasons)
9. [Timeline Expectations](#timeline-expectations)
10. [Post-Submission Checklist](#post-submission-checklist)

---

## Prerequisites

Before submitting to either store, ensure the following are in place:

### General
- [ ] Node.js 20+ installed
- [ ] EAS CLI installed: `npm install -g eas-cli`
- [ ] Logged into EAS: `eas login`
- [ ] EAS project initialised: `cd apps/mobile && eas init`
- [ ] Production API deployed at `https://api.trademate.co.nz`
- [ ] Privacy policy published at `https://trademate.co.nz/privacy`
- [ ] Support page published at `https://trademate.co.nz/support`
- [ ] All app store listing content prepared (see `apps/mobile/store-listing.json`)
- [ ] Screenshots captured for all required sizes
- [ ] App icon finalised (1024x1024 for iOS, 512x512 for Android)

### Asset Checklist
- [ ] `apps/mobile/assets/icon.png` - 1024x1024 px, no transparency, no rounded corners
- [ ] `apps/mobile/assets/adaptive-icon.png` - 1024x1024 px, foreground for Android adaptive icon
- [ ] `apps/mobile/assets/splash.png` - Splash screen image
- [ ] `apps/mobile/assets/notification-icon.png` - 96x96 px, white on transparent, Android notifications
- [ ] `apps/mobile/assets/favicon.png` - 48x48 px, web favicon

---

## Apple App Store Submission

### Step 1: Apple Developer Account

1. Go to [developer.apple.com](https://developer.apple.com)
2. Sign in with your Apple ID (or create one)
3. Enrol in the Apple Developer Programme ($99 USD/year)
4. Complete enrolment as **Organisation** (Instilligent Limited)
   - D-U-N-S for Instilligent Limited: **594912489** (recorded 2026-07-31; SSOT `cortexforge/audit/legal/INSTILLIGENT_LIMITED_IDENTITY_2026-07-31.md`)
   - If Apple/DnB ever need a new one: free request at [dnb.com](https://www.dnb.com/duns-number.html) (takes 5-10 business days)
5. Wait for enrolment approval (typically 24-48 hours)
6. Note your **Team ID** from [developer.apple.com/account](https://developer.apple.com/account) > Membership Details

### Step 2: App Store Connect Setup

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **My Apps** > **+** > **New App**
3. Fill in:
   - **Platform**: iOS
   - **Name**: `TradeMate NZ`
   - **Primary Language**: English (Australia) (closest to NZ English)
   - **Bundle ID**: `nz.instilligent.trademate` (register this first under Certificates, Identifiers & Profiles)
   - **SKU**: `nz.instilligent.trademate`
   - **Access**: Full Access
4. Note the **App Store Connect App ID** (numeric, shown in the app URL)

### Step 3: Update EAS Configuration

Update `apps/mobile/eas.json` with your actual values:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-actual-apple-id@example.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABC123DEF4"
    }
  }
}
```

### Step 4: App Store Listing

In App Store Connect, fill in the following fields:

| Field | Value |
|-------|-------|
| **Name** | TradeMate NZ |
| **Subtitle** | AI Safety Docs & Invoicing |
| **Primary Category** | Business |
| **Secondary Category** | Productivity |
| **Age Rating** | 4+ (no objectionable content) |
| **Support URL** | https://trademate.co.nz/support |
| **Marketing URL** | https://trademate.co.nz |
| **Privacy Policy URL** | https://trademate.co.nz/privacy |
| **Copyright** | 2026 Instilligent Limited |

**Keywords** (100 character limit):
```
tradies,SWMS,invoicing,compliance,NZ,WorkSafe,quotes,safety,business,tradesperson
```

**What's New in This Version**:
```
Welcome to TradeMate NZ! The all-in-one business app built specifically for Kiwi tradies.

- AI-powered SWMS document generation
- Professional invoicing with PDF export
- Quote builder with one-tap invoice conversion
- Expense tracking with receipt photo capture
- Job site logging with clock in/out timer
- Team management with role-based access
- Certification expiry tracking with push reminders
- Dashboard with revenue insights and analytics

Currently in FREE BETA - all features unlocked at no cost.
```

**Description**: See the full description in `apps/mobile/store-listing.json` or the [App Store Listing Content](#app-store-listing-content) section below.

### Step 5: App Review Information

Provide a demo account for Apple reviewers:

| Field | Value |
|-------|-------|
| **First Name** | App |
| **Last Name** | Reviewer |
| **Email** | reviewer@trademate.co.nz |
| **Password** | (create a dedicated test account) |
| **Phone** | +64 XX XXX XXXX |

**Notes for Reviewers**:
```
TradeMate NZ is a business management app for New Zealand tradespeople
(plumbers, electricians, builders, etc.). It helps them manage health and
safety compliance documentation (SWMS - Safe Work Method Statements),
invoicing, quoting, expense tracking, and team management.

The app requires an account to use. A demo account has been provided above.

Camera access is used to photograph receipts, job sites, and safety
documentation. Photo library access is used to attach existing images
to invoices, expenses, and job logs.

The app is currently in free beta. No in-app purchases are active at
this time. Subscription features are planned for a future update.

The app does not use any third-party advertising or analytics SDKs.
Push notifications are used solely for certification expiry reminders.
```

### Step 6: Export Compliance

In App Store Connect:
- **Uses encryption**: No (we set `usesNonExemptEncryption: false` in app.json)
- This covers standard HTTPS/TLS which is exempt

### Step 7: iOS Privacy Manifest

The privacy manifest is already configured in `app.json` under `ios.privacyManifests`. It declares:
- **Accessed API types**: UserDefaults, FileTimestamp, SystemBootTime, DiskSpace (all required by React Native/Expo)
- **Collected data types**: Email, Name, Phone Number, Photos (all for app functionality, not tracking)
- **Tracking**: No

---

## Google Play Store Submission

### Step 1: Google Play Developer Account

1. Go to [play.google.com/console](https://play.google.com/console)
2. Sign in with a Google account
3. Pay the one-time registration fee ($25 USD)
4. Complete identity verification (may take 1-2 days)
5. Create a developer profile for **Instilligent Limited**

### Step 2: Create a Google Service Account

This is required for EAS to upload builds automatically.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google Play Android Developer API**
4. Go to **IAM & Admin** > **Service Accounts**
5. Click **Create Service Account**:
   - Name: `eas-submit`
   - Role: none needed at this level
6. Click on the created service account > **Keys** > **Add Key** > **Create New Key** > **JSON**
7. Download the JSON key file
8. Save it as `apps/mobile/google-service-account.json`
9. **Add this file to .gitignore** (it contains credentials)

### Step 3: Grant Play Console Access

1. In Google Play Console, go to **Settings** > **API access**
2. Link the Google Cloud project
3. Find the service account and click **Manage Play Console permissions**
4. Grant **Release Manager** or **Admin** permissions
5. Apply to the TradeMate NZ app (or all apps)

### Step 4: Play Console App Setup

1. In Google Play Console, click **Create app**
2. Fill in:
   - **App name**: TradeMate NZ - Tradie Business App
   - **Default language**: English (New Zealand) or English (Australia)
   - **App or Game**: App
   - **Free or Paid**: Free
   - Accept the declarations
3. Complete the **Dashboard setup tasks**:

#### Store Listing

| Field | Value |
|-------|-------|
| **Title** | TradeMate NZ - Tradie Business App |
| **Short description** (80 chars) | AI safety docs, invoicing & business tools for NZ tradies |
| **Full description** | See store-listing.json |
| **App icon** | 512x512 px (from icon.png, scaled down) |
| **Feature graphic** | 1024x500 px (create branded graphic) |
| **Category** | Business |
| **Tags** | Invoice, Business management, Safety |

#### Content Rating

Complete the IARC content rating questionnaire:
- **Violence**: No
- **Sexuality**: No
- **Language**: No
- **Controlled substances**: No
- **User interaction**: Users can share invoices via email/link (limited interaction)
- **User-generated content**: No public UGC
- **Location sharing**: No (location used only for job site addresses, stored locally)
- **Purchases**: No (free beta, future in-app subscriptions)

Expected rating: **Everyone** / **PEGI 3**

#### Data Safety Form

Complete the Data Safety section in Play Console:

**Does your app collect or share any of the required user data types?** Yes

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Name | Yes | No | App functionality, Account management | No |
| Email address | Yes | No | App functionality, Account management | No |
| Phone number | Yes | No | App functionality (invoicing) | Yes |
| Address | Yes | No | App functionality (invoicing, job logs) | Yes |
| Photos | Yes | No | App functionality (receipts, site photos) | Yes |
| Financial info (invoices) | Yes | No | App functionality | No |

**Is data encrypted in transit?** Yes (HTTPS/TLS)
**Can users request data deletion?** Yes (via support email)
**Does the app use advertising?** No
**Does the app use analytics?** No third-party analytics

#### App Access

Since the app requires login:
1. Go to **Policy** > **App access**
2. Select **All or some functionality is restricted**
3. Add instructions: "Account required. Create a new account from the registration screen, or use the demo credentials provided."
4. Provide demo credentials (same as Apple review account)

### Step 5: Target API Level

Google Play requires targeting a recent Android API level. EAS Build with Expo SDK 54 targets:
- **Target SDK**: 35 (Android 15)
- **Minimum SDK**: 24 (Android 7.0)

This is handled automatically by the Expo build system.

---

## App Store Listing Content

All listing content is maintained in `apps/mobile/store-listing.json`. Below is a summary.

### App Name
- **Apple**: TradeMate NZ
- **Google**: TradeMate NZ - Tradie Business App

### Short Description (Google Play, 80 chars)
```
AI safety docs, invoicing & business tools for NZ tradies
```

### Subtitle (Apple, 30 chars)
```
AI Safety Docs & Invoicing
```

### Keywords (Apple, 100 chars)
```
tradies,SWMS,invoicing,compliance,NZ,WorkSafe,quotes,safety,business,tradesperson
```

### Full Description

The full description is in `apps/mobile/store-listing.json`. Key points to include:
- Purpose: all-in-one business app for NZ tradies
- Free beta (all features unlocked)
- AI-powered SWMS generation (Health and Safety at Work Act 2015)
- Invoicing with GST, PDF export, email sending
- Quote builder with invoice conversion
- Expense tracking with receipt photos
- Job site logging with timer
- Team management
- Certification expiry tracking
- Revenue dashboard with insights
- Built for NZ (WorkSafe, GST, IRD-ready)

---

## Screenshot Requirements

### Apple App Store

You need screenshots for at least these device sizes:

| Device | Resolution | Required |
|--------|-----------|----------|
| 6.7" iPhone (iPhone 15 Pro Max) | 1290 x 2796 px | Yes (required for all iPhones) |
| 5.5" iPhone (iPhone 8 Plus) | 1242 x 2208 px | Yes (if supporting older devices) |
| 12.9" iPad Pro (6th gen) | 2048 x 2732 px | Only if iPad is supported |

**Minimum**: 2 screenshots per size | **Maximum**: 10 per size | **Recommended**: 5

### Google Play Store

| Asset | Resolution | Required |
|-------|-----------|----------|
| Phone screenshots | Min 320px, max 3840px on any side | Yes (min 2, max 8) |
| Feature graphic | 1024 x 500 px | Yes |
| App icon (Hi-res) | 512 x 512 px | Yes |
| Tablet screenshots | Same as phone | No (recommended) |

### Suggested Screenshots (5 screens)

Capture these screens in the running app:

1. **Dashboard** - Home tab showing revenue stats, insights, and quick actions
   - Caption: "Your business at a glance - revenue, insights & quick actions"

2. **SWMS Generator** - AI-powered safety document creation
   - Caption: "Generate WorkSafe-compliant SWMS in seconds with AI"

3. **Invoice Creation** - Invoice form with line items and GST
   - Caption: "Professional invoices with GST - create, send & track"

4. **Expense Tracking** - Expense list with categories and receipt photo
   - Caption: "Track expenses & snap receipt photos on the go"

5. **Team Management** - Team members list with roles
   - Caption: "Manage your team with role-based access & invites"

### Screenshot Tips

- Use a clean device/simulator with realistic demo data
- Ensure the status bar shows a full battery, strong signal, and a reasonable time
- Consider using a screenshot framing tool (e.g., screenshots.pro, AppLaunchpad) to add device frames and captions
- Use consistent branding (navy #1e3a5f background for frames)
- Do not include any real customer or personal data

---

## Privacy Policy Requirements

A privacy policy is required by both stores and must be accessible at `https://trademate.co.nz/privacy`.

### Must Include (NZ Privacy Act 2020 Compliant)

1. **Who we are**: Instilligent Limited, New Zealand company
2. **What data we collect**:
   - Account information (name, email, phone number)
   - Business information (company name, trade type, bank account name for invoicing)
   - Invoice and quote data (customer details, line items, amounts)
   - Expense records (amounts, categories, receipt photos)
   - Job log data (site addresses, clock in/out times, notes)
   - SWMS documents (job descriptions, hazards, control measures)
   - Certification records (certificate names, expiry dates)
   - Device push notification tokens
   - Photos uploaded through the app (receipts, site photos)
3. **Why we collect it**: To provide the app's core functionality
4. **How we store it**: Encrypted in transit (TLS), stored on secured servers in [hosting region]
5. **Who we share it with**:
   - No data sold to third parties
   - Invoice recipients receive invoice data when the user sends an invoice
   - AI processing via Anthropic's Claude API for SWMS generation (job descriptions only, no PII)
   - Email delivery via transactional email service
6. **How long we keep it**: For as long as the account is active, plus a reasonable period after deletion
7. **User rights under NZ Privacy Act 2020**:
   - Right to access personal information
   - Right to request correction
   - Right to request deletion
   - Contact: privacy@trademate.co.nz
8. **Children's privacy**: Not designed for children under 13
9. **Changes to policy**: Users notified via email or in-app notification
10. **Contact**: privacy@trademate.co.nz

---

## Build and Submit Commands

### Initial Setup (First Time Only)

```bash
# Navigate to mobile app directory
cd apps/mobile

# Install EAS CLI if not already installed
npm install -g eas-cli

# Log in to Expo account
eas login

# Initialise the EAS project (creates the project ID)
eas init

# Update app.json with the real project ID from eas init output
# Replace "trademate-nz" placeholder in extra.eas.projectId
```

### Building for App Stores

```bash
# Build for iOS (App Store)
eas build --platform ios --profile production

# Build for Android (Play Store)
eas build --platform android --profile production

# Build for both platforms simultaneously
eas build --platform all --profile production
```

### Submitting to Stores

```bash
# Submit iOS build to App Store Connect
eas submit --platform ios --profile production

# Submit Android build to Google Play Console
eas submit --platform android --profile production

# Submit both
eas submit --platform all --profile production

# Submit a specific build (use the build URL from eas build output)
eas submit --platform ios --profile production --url https://expo.dev/artifacts/eas/XXXXX.ipa
```

### Testing Before Submission

```bash
# Build a preview APK for internal testing (Android)
eas build --platform android --profile preview

# Build for internal distribution (iOS - requires ad hoc provisioning)
eas build --platform ios --profile preview

# Run a local production-like build check
npx expo export --platform ios
npx expo export --platform android
```

### Over-the-Air Updates (Post-Launch)

```bash
# Push a JS-only update without a new store build
eas update --channel production --message "Bug fix: invoice PDF formatting"

# Check update status
eas update:list
```

---

## Common Rejection Reasons

### Apple App Store

| Reason | How to Avoid |
|--------|-------------|
| **Incomplete information** | Fill in ALL App Store Connect fields including review notes and demo credentials |
| **Broken links** | Ensure support URL and privacy policy URL are live and accessible |
| **Placeholder content** | Remove all "Lorem ipsum", test data, and TODO markers from the app |
| **Missing purpose strings** | All permission usage descriptions must clearly explain why the app needs access (already configured in app.json) |
| **Guideline 4.2 - Minimum functionality** | Ensure the app provides genuine value. TradeMate has substantial functionality so this should not be an issue |
| **Guideline 5.1.1 - Data collection** | Privacy policy must match the data you actually collect. Ensure the privacy manifest in app.json is accurate |
| **Guideline 3.1.1 - In-App Purchase** | If subscription features are visible but not functional, clarify in review notes that they are "coming soon" and the app is in free beta |
| **Crashes or bugs** | Test thoroughly on physical devices before submission. Pay attention to edge cases like empty states, network errors, and permission denial flows |
| **Login required** | Provide demo credentials in App Review Information |
| **iPad layout** | If supporting iPad, ensure the layout works properly on larger screens |

### Google Play Store

| Reason | How to Avoid |
|--------|-------------|
| **Data safety form incomplete** | Fill in every section of the data safety questionnaire accurately |
| **Missing privacy policy** | Must be linked in both the store listing and within the app (settings screen) |
| **Target API level too low** | Expo SDK 54 targets API 35, which meets current requirements |
| **App access instructions missing** | Provide demo credentials since login is required |
| **Misleading store listing** | Ensure screenshots and description accurately represent the app |
| **Permissions not justified** | Each permission must be used and justified. Do not request unnecessary permissions |
| **Content rating missing** | Complete the IARC questionnaire before submitting |
| **Feature graphic missing** | 1024x500 px graphic is mandatory |

---

## Timeline Expectations

| Store | Initial Review | Typical Approval | Expedited Review |
|-------|---------------|------------------|------------------|
| **Apple App Store** | 1-3 days (first submission may take up to 7 days) | 24-48 hours for updates | Available via [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store) |
| **Google Play Store** | 1-3 days (first submission may take up to 7 days) | Usually within 24 hours for updates | Not available |

### Important Notes

- **First submission** takes longer for both stores due to more thorough review
- **Apple** may ask follow-up questions via App Store Connect Resolution Centre
- **Google** may issue policy warnings that must be addressed before approval
- **Holidays** (especially Christmas/New Year) significantly slow review times
- **Plan to submit 2 weeks before your target launch date** to account for potential rejections and re-submissions

---

## Post-Submission Checklist

### Immediate (Day of Submission)

- [ ] Verify production API is running and accessible
- [ ] Verify privacy policy URL is live
- [ ] Verify support URL is live
- [ ] Test demo account credentials work
- [ ] Monitor EAS build/submit status: `eas build:list` and `eas submit:list`

### During Review (1-7 Days)

- [ ] Monitor App Store Connect for messages from Apple review team
- [ ] Monitor Google Play Console for policy issues
- [ ] Keep production API stable (avoid deployments during review)
- [ ] Be ready to respond quickly to reviewer questions

### After Approval

- [ ] Set the release date (or release immediately)
- [ ] Verify the app appears in store search
- [ ] Download and test the store version on a real device
- [ ] Monitor crash reports (App Store Connect + Play Console)
- [ ] Announce the launch to beta users
- [ ] Set up App Store Connect and Play Console analytics dashboards
- [ ] Plan the first update based on initial user feedback

---

## Useful Links

- [Expo EAS Build documentation](https://docs.expo.dev/build/introduction/)
- [Expo EAS Submit documentation](https://docs.expo.dev/submit/introduction/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Developer Policy Centre](https://play.google.com/about/developer-content-policy/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design Guidelines](https://m3.material.io/)
- [NZ Privacy Act 2020](https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html)
- [App Store Connect](https://appstoreconnect.apple.com)
- [Google Play Console](https://play.google.com/console)
