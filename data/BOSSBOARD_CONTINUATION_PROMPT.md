# BossBoard - Continuation Prompt

Use this prompt to resume work on BossBoard in a new Claude Code session.

> **Brand history**: This product was previously named "TradeMate NZ". Consolidated to a single
> brand on 2026-05-11; the on-disk path retains the legacy `trademate-nz` name pending a
> coordinated GitHub-repo rename (Marc-action). The third-party domain `trademate.co.nz`
> is owned by an unrelated company and is not part of this product.

---

## Project Context

- **Project**: BossBoard - Mobile compliance & cashflow platform for NZ tradies
- **Location**: `/home/marc/projects/trademate-nz` (legacy on-disk path; `package.json` `"name": "bossboard"`)
- **GitHub**: `git@github.com:marc-2019/trademate-nz.git` (rename to `marc-2019/bossboard` pending Marc-action)
- **Main Branch**: `master`
- **Current Version**: 0.5.0 (beta-ready, all core features complete)

## Architecture Summary

- **Frontend**: React Native (Expo) - offline-first with SQLite + Next.js web at `apps/web/`
- **Backend**: Node.js/Express + TypeScript at `apps/api/`
- **Database**: PostgreSQL (port 29432) + Redis (port 29379)
- **AI**: Claude API for compliance doc generation
- **Integrations**: Xero (planned), Stripe NZ (planned), Twilio (planned)

## Current Status

**Phase**: Beta-Ready (v0.5.0 complete) - monetisation prep

### What's Done (v0.1.0 - v0.5.0)
- Foundation, auth, SWMS, certifications
- Invoicing + PDF + email + sharing
- Quotes + expenses + job-logs + photos + teams
- Subscription tiers + middleware + email verification
- Web landing page at `apps/web/src/app/page.tsx`

### What's Next (Unreleased)
- Stripe NZ integration (paid subscriptions)
- App Store submission (iOS + Android)
- Landing page polish + custom domain decision
- Xero integration (Module 2 - Cashflow Forecasting)
- Digital signature capture for SWMS
- In-app messaging (team chat)

## Key Files to Review

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Full project brain (read first) |
| `apps/api/src/index.ts` | API entry point |
| `apps/api/src/services/claude.ts` | AI integration |
| `apps/api/src/services/stripe.ts` | Stripe billing (uses legacy `trademate_user_id` metadata key) |
| `marketing-truths.json` | Marketing-claim audit log (recall PR #2 + #3) |
| `docs/product/GAPS_AND_ROADMAP.md` | Current roadmap |

## Commands to Run First

```bash
# Navigate to project
cd /home/marc/projects/trademate-nz

# Check git status
git status

# Start infrastructure (if needed)
docker-compose up -d

# Verify health
curl http://localhost:29000/health
```

## Development Guidelines

1. **Offline-First**: All mobile features must work offline
2. **NZ-Specific**: Use NZ regulations, suppliers, terminology
3. **AI Integration**: Use Claude API for hazard/control suggestions
4. **Testing**: Maintain 80% coverage on critical paths
5. **Commits**: Use conventional commits (`feat:`, `fix:`, `docs:`)
6. **Marketing-truth hook**: Customer-facing copy changes require `MARC-APPROVED:` trailer + marketing-truths.json update (enforced by `.git-hooks/marketing-truth-*`)
7. **Brand-bleed**: Do NOT reintroduce "TradeMate NZ" / "TradeMate" in customer-facing copy. Internal dev notes can reference the rename history.

## Module Priority

1. **Compliance** (shipped) - SWMS, risk assessments, checklists
2. **Business management** (shipped) - invoices, quotes, expenses, jobs, teams
3. **Cashflow** (Q2-Q3) - Xero integration, forecasting
4. **Hiring/Visa** (Q3-Q4) - Visa tracking, AEWV compliance

## Integration Notes

- **CortexForge**: Project registered with slug `trademate-nz` (legacy; canonical CF project_id for BossBoard)
- **Compound Layer**: Nightly reviews enabled
- **Context Store**: Learnings synced

---

## Copy-Paste Prompt

```
I'm continuing work on BossBoard, a mobile-first compliance and cashflow platform for NZ tradies.

Project location: /home/marc/projects/trademate-nz  (legacy on-disk name; package.json "name": "bossboard")

Please read CLAUDE.md for full context, then check docs/product/GAPS_AND_ROADMAP.md for current status.

Current focus: [INSERT YOUR CURRENT TASK]
```
