# Answer component brief — BossBoard vs Tradify (NZ solo tradie)

**Type:** Citation Gap **decision + evidence** page (not a generic blog).  
**Frozen prompts closed (target):** BB-03, BB-04 (supports BB-01, BB-06).  
**Primary URL (proposed):** `https://bossboard.instilligent.com/compare/tradify`  
  Fallbacks: `/vs/tradify` or a stable marketing path you already use.  
**Author:** Marc Armstrong / Instilligent · **Visible update date:** required on page.  
**Do not publish until:** marketing-truths check + pricing honesty (BETA) + four-eyes if customer-facing.

---

## 1. Job this page performs for AI/human buyers

When someone asks *“Tradify alternative NZ”* or *“BossBoard vs Tradify”*, this page should be a **quotable shortlist component**:

- Direct answer in the first screenful  
- Same criteria for both products  
- Clear **best for** language  
- Honest limitations (especially BossBoard)  
- Verifiable pricing stance  
- Links to primary sources (our llms.txt, homepage, legal)

**Not the job:** 700 words on “why admin is hard.” Not claiming #1 rank. Not inventing competitor prices without a dated source footnote.

---

## 2. Audience and revenue event

| | |
|--|--|
| **Who** | Solo NZ tradie or 2–3 person crew (electrician/plumber/builder first) |
| **Trigger** | Frustrated with Tradify cost/complexity, or paper SWMS + Word invoices |
| **Event** | Signup / trial · paid Tradie **only after** `BETA_MODE=false` truth on page |
| **Anti-audience** | Enterprise multi-branch contractors needing deep job scheduling ERP |

---

## 3. Direct answer (draft — edit on truths review)

> For a **New Zealand solo tradie** who needs **SWMS drafts, GST invoices, and offline-friendly job notes**, **BossBoard** is built as an affordable all-in-one mobile-first app with **AI-assisted SWMS templates** (not legal advice — you remain the PCBU). **Tradify** is a more established job-management platform widely used in NZ trades, typically stronger if you already live in a full job-scheduling workflow and accept a higher monthly price.  
> Choose **BossBoard** if offline + SWMS-first + low price matter most. Choose **Tradify** if you need a mature ecosystem and team workflows you already know. Compare both on the table below — and verify current pricing on each vendor’s site.

---

## 4. Comparison table (same criteria)

Fill competitor cells only with **dated** public sources (or “unverified — check vendor”). Internal research from launch checklist is a starting point, not a public claim without re-check.

| Criterion | BossBoard | Tradify | Notes / source |
|-----------|-----------|---------|----------------|
| Primary focus | Compliance (SWMS) + invoices + jobs in one mobile app | Job management / field service (verify current pitch) | BB: llms.txt |
| NZ-first (GST, HSWA framing) | Yes — GST 15%, HSWA/SWMS language | NZ presence historically strong — re-verify | |
| AI SWMS drafts | Yes — templates/starting material; **operator reviews & signs** | Verify if any AI SWMS | BB: never claim legal advice |
| Offline | Offline-first sync (design goal / product claim) | Often cited as weaker offline — **verify** | |
| Pricing posture | Free / Tradie / Team; **beta may mean not charging yet** | Publicly ~$30–50/mo class historically — **re-verify dated** | Checklist 2026 research only until rechecked |
| Best for | Solo / small crew, SWMS + admin in one pocket | Teams deep in job workflows | |
| Honest limit | Younger product; fewer third-party reviews; beta pricing truth | Higher cost; may be overkill for pure solo SWMS+invoice | |

**Rules for writers/agents:**

- Every non-BB cell needs a URL + access date or stay “unverified.”  
- BossBoard must lose at least one fair row (credibility).  
- No fabricated star ratings or “#1 in NZ.”

---

## 5. Must-include answer components

1. **H1** that matches the decision (e.g. “BossBoard vs Tradify for NZ solo tradies”).  
2. **Direct answer** (section 3) above the fold.  
3. **Comparison table** (section 4).  
4. **Best for** bullets (BossBoard / Tradify / neither).  
5. **AI SWMS limitation box** — PCBU accountability; not legal advice.  
6. **Pricing section** — link to `#pricing` + state beta/charging honestly from live product.  
7. **Integrations / stack** — only what is true (do not invent Xero sync etc.).  
8. **Screenshots** — SWMS generate + invoice (real product, no mock marketing lies).  
9. **Author + last updated** visible.  
10. **Primary links:** homepage, signup, privacy, `llms.txt`.  
11. **FAQ (3–5)** from frozen prompts BB-01, BB-07, BB-08.  
12. **Schema** if the stack supports FAQPage/Article (optional; don’t block ship).

---

## 6. Claims allow-list (BossBoard only)

Pull from live `llms.txt` / marketing-truths — **do not expand**:

- Mobile-first NZ tradies app  
- AI-assisted SWMS **templates / starting material**, not legal advice  
- GST-ready invoicing (15%)  
- Quotes, expenses, job logs, photos, teams (as shipped)  
- Offline sync design  
- Instilligent Limited · NZBN 9429041896853  

**Forbidden without new truth + Marc-yes:** pass rates, customer counts, “chosen by X tradies,” competitor disparagement, fixed competitor prices without date.

---

## 7. Distribution targets (after publish — gap type: distribution)

Do **not** start with “please add us.” After page is live:

| Target type | Pitch angle |
|-------------|-------------|
| NZ tradie “best tools” listicles that already name Tradify/Fergus | Missing option for **SWMS-first + offline + lower price** |
| Comparison roundups | Offer **sourced table** + screenshots for next update |
| Trade Facebook/LinkedIn groups | Share as “how we compare ourselves honestly” not ads |

Pitch skeleton:

> Your piece compares [A, B]. It doesn’t cover teams that need **AI-assisted SWMS drafts + GST invoices offline** at solo-tradie price. We published a same-criteria comparison with sources: [URL]. Happy to send facts/screenshots if useful for an update.

---

## 8. Definition of done

- [ ] Page live on bossboard.instilligent.com (stable URL)  
- [ ] Linked from homepage footer or Resources  
- [ ] Linked from `llms.txt` Key Pages  
- [ ] marketing-truths / four-eyes for customer-facing copy  
- [ ] Frozen prompts BB-03 + BB-04 rescanned; results in  
      `cortexforge/docs/ops/citation-gap-frozen-prompts-2026-07-26.md` Rescan log  
- [ ] No secret pricing or untrue “now charging” if still beta  

---

## 9. Out of scope for v1

- Full 5-way megatable (Fergus, ServiceM8, Jobber) — v2 after first rescan  
- Courses or ONN cross-posts of this BB page  
- Paid listicle placement without Marc-yes  
- Claiming AI Overview / ChatGPT “wins”

---

## 10. Implementation note for agents

1. Prefer **Next.js static page** under apps/web marketing routes if that is the current pattern.  
2. Reuse landing brand CSS; keep table mobile-scrollable.  
3. Cite BB facts from `llms.txt` text, not memory.  
4. After ship: open PR only on BB launch branch; four-eyes before push if Marc-facing.

**Companion:** frozen prompt sheet  
`cortexforge/docs/ops/citation-gap-frozen-prompts-2026-07-26.md`
