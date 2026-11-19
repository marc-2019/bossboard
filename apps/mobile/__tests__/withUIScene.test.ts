import * as fs from 'fs';
import * as path from 'path';

const mobileRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(mobileRoot, 'app.json');
const pluginPath = path.join(mobileRoot, 'plugins/withUIScene.js');
const pluginId = './plugins/withUIScene';

const EXPO_54_APP_DELEGATE_WINDOW_BLOCK = `    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

function pluginIds(plugins: unknown[]): string[] {
  return plugins.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
}

describe('UIScene lifecycle adoption', () => {
  it('registers ./plugins/withUIScene in app.json so prebuild cannot skip it', () => {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    expect(pluginIds(appJson.expo.plugins)).toContain(pluginId);
  });

  it('adds UIApplicationSceneManifest with a single application scene and SceneDelegate', () => {
    const withUIScene = require(pluginPath);
    const config = withUIScene({
      name: 'BossBoard',
      slug: 'trademate-nz',
      ios: { infoPlist: { NSCameraUsageDescription: 'keep-me' } },
    });

    const manifest = config.ios.infoPlist.UIApplicationSceneManifest;
    expect(manifest).toBeDefined();
    expect(manifest.UIApplicationSupportsMultipleScenes).toBe(false);
    const scenes =
      manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
    expect(scenes).toHaveLength(1);
    expect(scenes[0].UISceneConfigurationName).toBe('Default Configuration');
    expect(scenes[0].UISceneDelegateClassName).toBe('SceneDelegate');
    expect(config.ios.infoPlist.NSCameraUsageDescription).toBe('keep-me');
  });

  it('ships a SceneDelegate that hosts the RN window and forwards deep links', () => {
    const withUIScene = require(pluginPath);
    const source = fs.readFileSync(withUIScene.SCENE_DELEGATE_SOURCE_PATH, 'utf8');
    expect(source).toMatch(/@objc\(SceneDelegate\)/);
    expect(source).toMatch(/UIWindowSceneDelegate/);
    expect(source).toMatch(/startReactNative\(/);
    expect(source).toMatch(/openURLContexts/);
    expect(source).toMatch(/continue userActivity/);
    expect(source).toMatch(/RCTLinkingManager/);
  });

  it('moves window + RN startup out of AppDelegate so the scene owns the root view', () => {
    const withUIScene = require(pluginPath);
    const patched = withUIScene.stripLegacyWindowStartup(
      EXPO_54_APP_DELEGATE_WINDOW_BLOCK
    );
    expect(patched).not.toMatch(/UIWindow\(frame: UIScreen\.main\.bounds\)/);
    expect(patched).not.toMatch(/factory\.startReactNative/);
    expect(patched).toMatch(/SceneDelegate/);
    expect(patched).toMatch(/bindReactNativeFactory\(factory\)/);
    expect(() => withUIScene.stripLegacyWindowStartup('class AppDelegate {}')).toThrow(
      /could not find AppDelegate window/
    );
  });

  it('resolved Expo config (plugin evaluation) includes UIApplicationSceneManifest', () => {
    const { getConfig } = require('@expo/config');
    const { exp } = getConfig(mobileRoot, { skipSDKVersionCheck: true });
    const manifest = exp.ios?.infoPlist?.UIApplicationSceneManifest;
    expect(manifest).toBeDefined();
    expect(
      manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0]
        .UISceneDelegateClassName
    ).toBe('SceneDelegate');
  });
});
