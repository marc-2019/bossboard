#!/usr/bin/env node
/**
 * EAS / local prebuild: RN 0.81 ships Folly inside ReactNativeDependencies (prebuilt).
 * react-native-iap@12 still declares s.dependency "RCT-Folly" under new arch, which
 * CocoaPods cannot resolve ("Unable to find a specification for RCT-Folly").
 *
 * Catalogued fix F18: cortexforge/docs/ops/bb-ios-local-build-learnings-2026-08-03.md
 * Do NOT inject source RCT-Folly.podspec (breaks Xcode 26 consteval on fmt).
 */
const fs = require('fs');
const path = require('path');

const candidates = [
  path.resolve(__dirname, '../../../node_modules/react-native-iap/RNIap.podspec'),
  path.resolve(__dirname, '../node_modules/react-native-iap/RNIap.podspec'),
  path.resolve(process.cwd(), 'node_modules/react-native-iap/RNIap.podspec'),
  path.resolve(process.cwd(), '../../node_modules/react-native-iap/RNIap.podspec'),
  // monorepo after EAS workspace install
  path.resolve(process.cwd(), 'node_modules/react-native-iap/RNIap.podspec'),
];

// Also walk up a few dirs
let dir = process.cwd();
for (let i = 0; i < 5; i++) {
  candidates.push(path.join(dir, 'node_modules/react-native-iap/RNIap.podspec'));
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

const target = [...new Set(candidates)].find((p) => fs.existsSync(p));
if (!target) {
  console.warn('[eas-patch-rniap] RNIap.podspec not found — skip');
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');

// Active (uncommented) Folly dependency?
const activeFolly = /^\s*s\.dependency\s+["']RCT-Folly["']/m.test(original);
if (!activeFolly) {
  console.log('[eas-patch-rniap] no active RCT-Folly dependency:', target);
  process.exit(0);
}

const patched = original.replace(
  /^[ \t]*s\.dependency\s+["']RCT-Folly["'][ \t]*\r?$/gm,
  '    # s.dependency "RCT-Folly"  # F18: RN 0.81 prebuilt ReactNativeDependencies'
);

if (patched === original || /^\s*s\.dependency\s+["']RCT-Folly["']/m.test(patched)) {
  // Last-resort: strip any line containing the dependency token (not comments)
  const lines = original.split(/\r?\n/);
  const out = lines.map((line) => {
    if (/^\s*s\.dependency\s+["']RCT-Folly["']/.test(line)) {
      return '    # s.dependency "RCT-Folly"  # F18: RN 0.81 prebuilt ReactNativeDependencies';
    }
    return line;
  });
  const joined = out.join('\n');
  if (joined === original) {
    console.error('[eas-patch-rniap] could not patch active Folly dep in', target);
    console.error(
      'lines with Folly:',
      lines.filter((l) => /Folly/i.test(l)).map((l) => JSON.stringify(l))
    );
    process.exit(1);
  }
  fs.writeFileSync(target, joined.endsWith('\n') ? joined : joined + '\n');
} else {
  fs.writeFileSync(target, patched);
}

console.log('[eas-patch-rniap] patched Folly dep out of', target);
process.exit(0);
