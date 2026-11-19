#!/usr/bin/env node
/**
 * MUST-FAIL gate: resolved Expo config must include UIApplicationSceneManifest
 * from ./plugins/withUIScene. Fails if the plugin is missing from app.json or
 * if plugin evaluation does not write the scene manifest.
 */
const path = require('path');
const fs = require('fs');

const mobileRoot = path.join(__dirname, '..');
const pluginId = './plugins/withUIScene';
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const pluginIds = (appJson.expo.plugins || []).map((entry) =>
  Array.isArray(entry) ? entry[0] : entry
);

if (!pluginIds.includes(pluginId)) {
  console.error(`FAIL: ${pluginId} is not registered in app.json expo.plugins`);
  process.exit(1);
}

const { getConfig } = require('@expo/config');
const { exp } = getConfig(mobileRoot, { skipSDKVersionCheck: true });
const manifest = exp.ios && exp.ios.infoPlist && exp.ios.infoPlist.UIApplicationSceneManifest;

if (!manifest) {
  console.error('FAIL: UIApplicationSceneManifest missing from resolved Expo config');
  process.exit(1);
}

const scenes =
  manifest.UISceneConfigurations &&
  manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
const delegateClass = scenes && scenes[0] && scenes[0].UISceneDelegateClassName;

if (delegateClass !== 'SceneDelegate') {
  console.error(
    'FAIL: UISceneDelegateClassName is not SceneDelegate:',
    JSON.stringify(manifest, null, 2)
  );
  process.exit(1);
}

console.log('PASS: UIApplicationSceneManifest present with SceneDelegate');
