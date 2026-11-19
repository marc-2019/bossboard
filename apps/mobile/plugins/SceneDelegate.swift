import Expo
import React
import UIKit

/// UIScene entry point for iOS 13+. Required when linking against the iOS 27 SDK
/// (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
///
/// Hosts the React Native root view the same way Expo SDK 54's generated
/// AppDelegate does (`factory.startReactNative(withModuleName:in:launchOptions:)`),
/// and forwards scene URL / user-activity events to AppDelegate so Expo
/// subscribers and RCTLinkingManager still see deep links.
@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      assertionFailure("UIApplication.shared.delegate is not AppDelegate")
      return
    }

    appDelegate.window = window
    appDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions(from: connectionOptions)
    )

    forwardConnectionOptions(connectionOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      forwardOpenURL(context.url, options: openURLOptions(from: context))
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwardUserActivity(userActivity)
  }

  private func forwardConnectionOptions(_ connectionOptions: UIScene.ConnectionOptions) {
    for context in connectionOptions.urlContexts {
      forwardOpenURL(context.url, options: openURLOptions(from: context))
    }
    for userActivity in connectionOptions.userActivities {
      forwardUserActivity(userActivity)
    }
  }

  private func forwardOpenURL(_ url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      _ = appDelegate.application(UIApplication.shared, open: url, options: options)
      return
    }
    _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: options)
  }

  private func forwardUserActivity(_ userActivity: NSUserActivity) {
    let restorationHandler: ([UIUserActivityRestoring]?) -> Void = { _ in }
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      _ = appDelegate.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: restorationHandler
      )
      return
    }
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }

  private func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var options: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let context = connectionOptions.urlContexts.first {
      options[.url] = context.url
      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
    }
    if let userActivity = connectionOptions.userActivities.first {
      options[.userActivityType] = userActivity.activityType
      options[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType: userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }
    return options.isEmpty ? nil : options
  }

  private func openURLOptions(
    from context: UIOpenURLContext
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = context.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = context.options.openInPlace
    return options
  }
}
