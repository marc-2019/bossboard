# sec-1006 P3 med/low — accepted residuals (BossBoard)

Governance: `instilligent-agent-instruction-governance-sdlc` (four-eyes, evidence-first). Standing rule: written exception when a Dependabot alert cannot be cleared with a **same-major** pin that keeps the tree installable and callable. Do **not** dismiss the GitHub alert. Recheck when upstream publishes a compatible patch or Marc approves a major stack lane.

## decode-uri-component (MEDIUM, Dependabot alert #122)

- **Advisory:** GHSA-vcc3-ghjq-m6fr — denial of service via exponential decoding of malformed percent-encoded input. Vulnerable range `<= 0.4.2`; Dependabot names patched **0.5.0**.
- **Package:** `decode-uri-component@0.2.2` in root `package-lock.json` (parent `query-string@7.1.3`, transitive via `@react-navigation/core` / `expo-router`).
- **Why unfixed on medlow lane:** `0.5.0` is **ESM-only** (`type: module`). `query-string@7.1.3` does `require('decode-uri-component')` and calls it as a function; with `0.5.0` installed, `query-string.parse` throws `decodeComponent is not a function`. There is no patched release on the 0.2.x–0.4.x CJS line. Overriding only `decode-uri-component@0.5.0` was tried on draft **#132** and rejected at four-eyes (tip `91c1f534`).
- **query-string 8+/9:** Major lane. `query-string@8+` is `"type": "module"` with default-only export; `@react-navigation/core` and `expo-router` use `import *` / `__importStar` then `.parse` / `.stringify`, which breaks on v9. Lock hoists to v9 also left incompatible `filter-obj` / `split-on-first` peers. Same pattern as ModularCompliance alert **#588** (`/home/marc/ace-logs/sec-1006/exceptions.md`).
- **Exposure:** Deep link / URL path parsing in the mobile navigation transitive tree. Not the Railway API deploy path.
- **Mitigation / plan:** Do not dismiss #122. Recheck if `query-string` 7.x gains a CJS-compatible patched `decode-uri-component`, or if Marc approves `query-string` 8+ / Expo major stack (see drafts #129–#131). Draft **#132** after send-back #1 is docs + lock revert only for this alert.
- **Owner:** Marc. **Status:** accepted residual for same-major medlow lane.
