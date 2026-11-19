/**
 * Adopt the UIScene lifecycle for Expo SDK 54 / RN 0.81 prebuild apps.
 *
 * Research (this tree): expo 54.0.33, expo-modules-core 3.0.29, react-native 0.81.5,
 * expo-template-bare-minimum 54.0.55. ExpoAppDelegate still has
 * `// TODO: - Configuring and Discarding Scenes` and no UIWindowSceneDelegate.
 * RCTReactNativeFactory only starts RN in a UIWindow. RCTLinkingManager has no
 * scene methods. The bare iOS template has no UIApplicationSceneManifest.
 * There is no official Expo 54 / RN 0.81 switch for this, so this plugin:
 *   1. Writes UIApplicationSceneManifest (one application scene → SceneDelegate)
 *   2. Adds SceneDelegate.swift that creates the window and hosts the RN root view
 *   3. Stops AppDelegate creating a second, scene-less window
 */

const fs = require('fs');
const path = require('path');
const { withInfoPlist, withAppDelegate, IOSConfig } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'SceneDelegate';
const SCENE_DELEGATE_SOURCE_PATH = path.join(__dirname, 'SceneDelegate.swift');

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
      },
    ],
  },
};

const WINDOW_START_RE =
  /^([ \t]*)window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n\1factory\.startReactNative\(\r?\n\1  withModuleName: "main",\r?\n\1  in: window,\r?\n\1  launchOptions: launchOptions\)/m;

function applySceneManifest(config) {
  config.ios = config.ios || {};
  config.ios.infoPlist = config.ios.infoPlist || {};
  config.ios.infoPlist.UIApplicationSceneManifest = {
    ...SCENE_MANIFEST,
  };
  return config;
}

function stripLegacyWindowStartup(contents) {
  if (!WINDOW_START_RE.test(contents)) {
    throw new Error(
      'withUIScene: could not find AppDelegate window/startReactNative block; Expo iOS template may have changed.'
    );
  }
  return contents.replace(
    WINDOW_START_RE,
    '$1// UIScene lifecycle: window + React Native root view are created in SceneDelegate.\n$1// Factory is bound above; SceneDelegate reads AppDelegate.reactNativeFactory.'
  );
}

function readSceneDelegateSource() {
  if (!fs.existsSync(SCENE_DELEGATE_SOURCE_PATH)) {
    throw new Error(`withUIScene: missing ${SCENE_DELEGATE_SOURCE_PATH}`);
  }
  return fs.readFileSync(SCENE_DELEGATE_SOURCE_PATH, 'utf8');
}

function withUIScene(config) {
  config = applySceneManifest(config);

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = { ...SCENE_MANIFEST };
    return cfg;
  });

  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'SceneDelegate.swift',
    contents: readSceneDelegateSource(),
    overwrite: true,
  });

  config = withAppDelegate(config, (cfg) => {
    const language = cfg.modResults.language;
    if (language && language !== 'swift') {
      throw new Error(`withUIScene: expected Swift AppDelegate, got ${language}`);
    }
    cfg.modResults.contents = stripLegacyWindowStartup(cfg.modResults.contents);
    return cfg;
  });

  return config;
}

module.exports = withUIScene;
module.exports.applySceneManifest = applySceneManifest;
module.exports.stripLegacyWindowStartup = stripLegacyWindowStartup;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
module.exports.SCENE_DELEGATE_CLASS = SCENE_DELEGATE_CLASS;
module.exports.SCENE_DELEGATE_SOURCE_PATH = SCENE_DELEGATE_SOURCE_PATH;
