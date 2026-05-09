# TradeMate NZ - Gaps & Roadmap

**Version**: 1.0.0 | **Last Updated**: 2026-02-02

---

## Executive Summary

TradeMate NZ is a mobile-first compliance and cashflow platform for NZ tradies. This document tracks known gaps, technical debt, and the product roadmap.

---

## Known Gaps

### P0 - Critical (Must fix before MVP)

| # | Gap | Category | Status | Target | Notes |
|---|-----|----------|--------|--------|-------|
| 1 | No working API | Infrastructure | In Progress | Week 2 | Express server scaffolding |
| 2 | No mobile app | Infrastructure | Planned | Week 2 | React Native setup |
| 3 | No database schema | Infrastructure | Planned | Week 2 | PostgreSQL migrations |
| 4 | No authentication | Security | Planned | Week 2 | JWT + magic link |

### P1 - High (Required for launch)

| # | Gap | Category | Status | Target | Notes |
|---|-----|----------|--------|--------|-------|
| 5 | SWMS template engine | Feature | Planned | Week 4 | Core value prop |
| 6 | Claude AI integration | Feature | Planned | Week 4 | Hazard suggestions |
| 7 | PDF generation | Feature | Planned | Week 5 | Document export |
| 8 | Offline storage | Feature | Planned | Week 5 | SQLite sync |
| 9 | Digital signatures | Feature | Planned | Week 6 | Sign-off workflow |

### P2 - Medium (Post-launch)

| # | Gap | Category | Status | Target | Notes |
|---|-----|----------|--------|--------|-------|
| 10 | Xero integration | Feature | Planned | Week 8 | Module 2 |
| 11 | Invoice chaser | Feature | Planned | Week 9 | SMS reminders |
| 12 | Visa tracking | Feature | Planned | Week 10 | Module 3 |
| 13 | Push notifications | Feature | Planned | Week 10 | Expo Push |
| 14 | Customer-facing invoice payment rail (Pay Now) | Feature | Planned | Week 12 | See docs/product/PAYMENT_GATEWAY_PARTNERS.md |

### P3 - Low (Nice to have)

| # | Gap | Category | Status | Target | Notes |
|---|-----|----------|--------|--------|-------|
| 15 | Dark mode | UX | Backlog | TBD | User request |
| 16 | Multi-language | UX | Backlog | TBD | Te Reo Maori |
| 17 | Team features | Feature | Backlog | TBD | Multi-user |

---

## Technical Debt

| # | Debt | Category | Impact | Effort | Notes |
|---|------|----------|--------|--------|-------|
| - | None | - | - | - | Greenfield project |

---

## Product Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Working infrastructure

- [x] Project structure
- [x] Documentation
- [ ] Docker setup
- [ ] Database schema
- [ ] Basic API with health endpoint
- [ ] React Native app scaffold
- [ ] Authentication (JWT + magic link)

### Phase 2: Compliance MVP (Weeks 3-6)
**Goal**: Usable SWMS generator

- [ ] SWMS template engine
- [ ] Trade type selection (electrician, plumber, builder)
- [ ] Claude AI hazard suggestions
- [ ] Claude AI control measures
- [ ] Form validation
- [ ] PDF export
- [ ] Digital signature capture
- [ ] Offline creation with SQLite
- [ ] Background sync

### Phase 3: Certification & Polish (Week 7)
**Goal**: Complete compliance module

- [ ] Certification tracker
- [ ] Expiry reminders
- [ ] Document upload
- [ ] Risk assessment builder
- [ ] WorkSafe checklist templates

### Phase 4: Cashflow Module (Weeks 8-10)
**Goal**: Xero integration + forecasting

- [ ] Xero OAuth2 connection
- [ ] Invoice sync
- [ ] Bill sync
- [ ] Cash position dashboard
- [ ] 30/60/90 day forecast
- [ ] Invoice chaser with SMS
- [ ] GST countdown

### Phase 5: Launch Prep (Weeks 11-12)
**Goal**: Production ready

- [ ] Stripe subscription billing
- [ ] Onboarding flow
- [ ] Push notifications
- [ ] Analytics integration
- [ ] App Store submission
- [ ] Play Store submission
- [ ] Landing page
- [ ] Documentation
- [ ] Implement customer-facing invoice payment rail (see docs/product/PAYMENT_GATEWAY_PARTNERS.md)

### Future Phases

**Module 3: Hiring/Visa (Q3-Q4 2026)**
- Visa tracker
- AEWV compliance
- Audit reports
- Document vault

**Enhancements (2027+)**
- Team/multi-user
- Supplier integration
- Quote generation
- Job scheduling

---

## Competitive Analysis

### Feature Comparison

| Feature | TradeMate | Tradify | Fergus | ServiceM8 | Jobber |
|---------|-----------|---------|--------|-----------|--------|
| NZ Compliance Docs | Yes | Basic | No | No | No |
| AI-Powered SWMS | Yes | No | No | No | No |
| Offline-First | Yes | No | No | No | No |
| Xero Integration | Yes | Yes | Yes | Yes | Yes |
| Price (NZD/mo) | $15-25 | $30-50 | $53-75 | ~$40 | $50-100 |
| Mobile App | Yes | Yes | Yes | Yes | Yes |
| Solo-Friendly | Yes | Yes | No | Yes | No |

### Our Advantages
1. **Only** platform with AI-powered NZ-specific compliance docs
2. **Only** platform with true offline-first architecture
3. **Lowest** price point for full feature set
4. **100%** NZ-focused (not US-adapted)

---

## Success Metrics

### Validation Phase (Weeks 1-4)
- [ ] 500 waitlist signups
- [ ] 20 user interviews completed
- [ ] $500 FB ad spend efficiency validated

### Beta Phase (Weeks 5-10)
- [ ] 50 active beta users
- [ ] 80% weekly retention
- [ ] NPS > 40
- [ ] <5% churn

### Launch Phase (Weeks 11+)
- [ ] 200 paying users (3 months)
- [ ] <$2/user infrastructure cost
- [ ] 80%+ gross margin
- [ ] <3% monthly churn

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low adoption | Medium | High | Validate with tradies early |
| Competitor response | Low | Medium | Move fast, build moat |
| Xero API changes | Low | Medium | Abstract integration layer |
| Compliance reg changes | Medium | Medium | Monitor WorkSafe updates |
| Claude API costs | Low | Low | Cache common responses |

---

## Review Schedule

| Review | Frequency | Next Date |
|--------|-----------|-----------|
| Gap triage | Weekly | 2026-02-09 |
| Roadmap review | Bi-weekly | 2026-02-16 |
| Competitive analysis | Monthly | 2026-03-02 |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Initial roadmap created | Claude/CortexForge |
