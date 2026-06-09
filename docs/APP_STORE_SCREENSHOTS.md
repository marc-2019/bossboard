# App Store Screenshots Guide

## Overview

This guide covers the screenshots needed for Apple App Store and Google Play Store submission. Screenshots are the #1 factor in app store conversion — users decide to download based on what they see.

---

## Screenshot Requirements

### Apple App Store (iOS)

| Device Size | Device | Resolution | Required | Recommended |
|-------------|--------|-----------|----------|-------------|
| 6.7" | iPhone 15 Pro Max | 1290 x 2796 | 2 minimum | 5-6 |
| 5.5" | iPhone 8 Plus | 1242 x 2208 | 2 minimum | 5-6 |

- Maximum 10 screenshots per device size
- First 3 screenshots visible without scrolling — make them count
- Can include text overlays/frames around screenshots

### Google Play Store (Android)

| Type | Resolution | Required | Recommended |
|------|-----------|----------|-------------|
| Phone | min 320px shortest, max 3840px longest | 2 minimum | 5-6 |
| Feature Graphic | 1024 x 500 | Yes (required) | 1 |

- Maximum 8 screenshots for phones
- Feature graphic is prominently displayed at top of listing

---

## Recommended Screenshot Set (5 screens)

### Screenshot 1: Dashboard (Home Tab)
**Title overlay**: "Your business at a glance — revenue, insights & quick actions"
- **Screen**: `app/(tabs)/index.tsx` — Home tab
- **What to show**: Dashboard with revenue stats, recent activity, quick action buttons
- **Prep**: Seed demo account with realistic data (invoices, expenses, jobs) so the dashboard shows meaningful numbers

### Screenshot 2: SWMS Generator
**Title overlay**: "Generate WorkSafe-compliant SWMS in seconds with AI"
- **Screen**: `app/swms/generate.tsx` — SWMS generation form
- **What to show**: The AI-powered SWMS form with trade type selected and hazards populated
- **Prep**: Fill in a realistic SWMS (e.g., "Electrical switchboard upgrade") with AI-generated hazards and controls visible

### Screenshot 3: Invoice Creation / Detail
**Title overlay**: "Professional invoices with GST — create, send & track"
- **Screen**: `app/invoices/[id].tsx` — Invoice detail view
- **What to show**: A completed invoice with line items, GST calculation, and action buttons (Send, PDF, Email)
- **Prep**: Create a professional-looking invoice with 3-4 line items, proper GST, and a real-looking customer name

### Screenshot 4: Expense Tracking
**Title overlay**: "Track expenses & snap receipt photos on the go"
- **Screen**: `app/expenses/index.tsx` — Expense list
- **What to show**: List of categorized expenses with amounts and category icons
- **Prep**: Add 6-8 sample expenses across different categories (materials, tools, fuel, etc.)

### Screenshot 5: Team Management
**Title overlay**: "Manage your team with role-based access & invites"
- **Screen**: `app/teams/index.tsx` — Team list
- **What to show**: Team members list with role badges (Owner, Admin, Worker), invite button
- **Prep**: Add 3-4 team members with different roles

---

## Optional Additional Screenshots (if submitting 6-8)

### Screenshot 6: Certifications
**Title overlay**: "Never miss a licence expiry — automatic reminders"
- **Screen**: `app/certifications/index.tsx`
- **What to show**: Certification list with status badges (valid/expiring/expired)

### Screenshot 7: Job Logging
**Title overlay**: "Clock in, clock out — track every hour on every site"
- **Screen**: `app/jobs/index.tsx`
- **What to show**: Active job with running timer, completed job history

### Screenshot 8: Quotes
**Title overlay**: "Build quotes in minutes, convert to invoices in one tap"
- **Screen**: `app/quotes/index.tsx`
- **What to show**: Quote list with status indicators (draft/sent/accepted)

---

## How to Capture Screenshots

### Method 1: Expo Dev Build on Simulators (Recommended)

```bash
# iOS Simulator (requires macOS)
cd apps/mobile
npx expo run:ios --device "iPhone 15 Pro Max"
# Use Cmd+S to save screenshot, or File > Save Screen in Simulator

# Android Emulator
npx expo run:android
# Use the camera icon in the emulator toolbar
```

### Method 2: Physical Device Screenshots

```bash
# Create a development build
cd apps/mobile
eas build --platform ios --profile development
eas build --platform android --profile development

# Install on device, take screenshots natively
# iOS: Side button + Volume Up
# Android: Power + Volume Down
```

### Method 3: Expo Screenshot Tool

```bash
# Use expo-screen-capture in development
npx expo install expo-screen-capture
```

---

## Screenshot Enhancement Tips

### Text Overlays
- Use a consistent frame/template around each screenshot
- Title text: 24-28pt, bold, white on dark background or dark on light
- Keep overlay text to 1 line (max 8 words)
- Use the brand color (#1e3a5f navy) for frame backgrounds

### Tools for Framing
- **Fastlane frameit** (free, CLI-based)
- **AppMockUp** (appmockup.com — free online tool)
- **Figma** with device mockup templates
- **Screenshots Pro** (paid, automated)

### Design Specs
- Background color: `#1e3a5f` (navy) or `#F9FAFB` (light grey)
- Title text color: `#FFFFFF` (on navy) or `#111827` (on light)
- Accent color: `#2563EB` (blue, matches app)
- Font: SF Pro (iOS) or Roboto (Android), or Inter (cross-platform)

---

## Demo Account Setup

Before capturing screenshots, set up a demo account with realistic data:

```
Email: reviewer@instilligent.com
Password: SET_BEFORE_SUBMISSION
```

### Seed Data Checklist
- [ ] Company name: "Spark Electrical Ltd" (or similar NZ trade business)
- [ ] Trade type: Electrician
- [ ] 5-6 invoices (mix of draft, sent, paid) with realistic amounts
- [ ] 3-4 quotes (draft, sent, accepted)
- [ ] 8-10 expenses across categories with realistic amounts
- [ ] 2-3 SWMS documents (different job types)
- [ ] 4-5 certifications (mix of valid, expiring in 14 days, expired)
- [ ] 3-4 team members with Owner/Admin/Worker roles
- [ ] 5+ job logs with hours, site addresses, notes
- [ ] 3-4 products/services in the catalogue
- [ ] 3-4 customers with contact details

### Revenue Data for Dashboard
Make sure the demo has enough invoice data to populate:
- Revenue comparison showing positive growth
- Outstanding aging buckets with realistic amounts
- Top 5 customers list
- 6-month revenue chart trending upward

---

## Google Play Feature Graphic

**Resolution**: 1024 x 500 pixels

### Design Suggestion
- Navy background (`#1e3a5f`)
- App icon on the left (150x150 area)
- Title: "BossBoard" in white bold text
- Tagline: "AI Safety Docs & Invoicing for Kiwi Tradies" below
- 2-3 small phone mockup frames showing key screens on the right side
- NZ flag or fern icon accent (optional, subtle)

---

## Submission Checklist for Screenshots

- [ ] All screenshots captured at correct resolutions
- [ ] Text overlays added with consistent branding
- [ ] No placeholder/lorem ipsum data visible
- [ ] No debug/development indicators visible (Expo dev menu, console bars)
- [ ] Realistic NZ data (NZ dollar amounts, NZ addresses, NZ company names)
- [ ] Status bar shows realistic time, battery, signal
- [ ] iPhone 15 Pro Max set (6.7") — minimum 3, ideally 5
- [ ] iPhone 8 Plus set (5.5") — minimum 3, ideally 5
- [ ] Android phone set — minimum 3, ideally 5
- [ ] Google Play feature graphic (1024x500)
