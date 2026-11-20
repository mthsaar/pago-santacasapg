import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let messenger = engineBridge.applicationRegistrar.messenger()

    // Canal de notificações nativas iOS
    let channel = FlutterMethodChannel(
      name: "br.com.santacasapg/notifications",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { call, result in
      if call.method == "requestPermission" {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
          result(granted)
        }
      } else if call.method == "showNotification" {
        let args = call.arguments as? [String: Any]
        let content = UNMutableNotificationContent()
        content.title = (args?["title"] as? String) ?? "Santa Casa PG • Maternidade"
        content.body = (args?["body"] as? String) ?? "Alerta de plantão / evolução"
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
        result(true)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }

    // TabBar nativa UIKit (adota Liquid Glass nativo automaticamente no iOS 26/27 SDK)
    engineBridge.applicationRegistrar.register(
      NativeLiquidGlassTabBarFactory(messenger: messenger),
      withId: "br.com.santacasapg/native_tab_bar"
    )
  }
}

final class NativeLiquidGlassTabBarFactory: NSObject, FlutterPlatformViewFactory {
  private let messenger: FlutterBinaryMessenger

  init(messenger: FlutterBinaryMessenger) {
    self.messenger = messenger
    super.init()
  }

  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
    return FlutterStandardMessageCodec.sharedInstance()
  }

  func create(
    withFrame frame: CGRect,
    viewIdentifier viewId: Int64,
    arguments args: Any?
  ) -> FlutterPlatformView {
    return NativeLiquidGlassTabBarView(
      frame: frame,
      viewId: viewId,
      args: args,
      messenger: messenger
    )
  }
}

final class NativeLiquidGlassTabBarView: NSObject, FlutterPlatformView, UITabBarDelegate {
  private let containerView: UIView
  private let tabBar: UITabBar
  private let channel: FlutterMethodChannel

  init(
    frame: CGRect,
    viewId: Int64,
    args: Any?,
    messenger: FlutterBinaryMessenger
  ) {
    self.containerView = UIView(frame: frame)
    self.containerView.backgroundColor = .clear
    self.containerView.isOpaque = false

    self.tabBar = UITabBar(frame: .zero)
    self.tabBar.translatesAutoresizingMaskIntoConstraints = false
    self.tabBar.isTranslucent = true
    self.tabBar.tintColor = UIColor(red: 0.137, green: 0.161, blue: 0.545, alpha: 1.0)

    self.channel = FlutterMethodChannel(
      name: "br.com.santacasapg/native_tab_bar_\(viewId)",
      binaryMessenger: messenger
    )

    super.init()

    let specs: [(title: String, icon: String, selectedIcon: String)] = [
      ("Escala", "calendar", "calendar"),
      ("Pacientes", "bed.double", "bed.double.fill"),
      ("Médicos", "person.2", "person.2.fill"),
      ("Fechamento", "chart.bar", "chart.bar.fill")
    ]

    var tabItems: [UITabBarItem] = []
    for (idx, spec) in specs.enumerated() {
      let item = UITabBarItem(
        title: spec.title,
        image: UIImage(systemName: spec.icon),
        selectedImage: UIImage(systemName: spec.selectedIcon)
      )
      item.tag = idx
      tabItems.append(item)
    }

    tabBar.items = tabItems
    tabBar.delegate = self

    let initialIndex = ((args as? [String: Any])?["selectedIndex"] as? Int) ?? 0
    if initialIndex >= 0 && initialIndex < tabItems.count {
      tabBar.selectedItem = tabItems[initialIndex]
    } else {
      tabBar.selectedItem = tabItems.first
    }

    containerView.addSubview(tabBar)
    NSLayoutConstraint.activate([
      tabBar.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
      tabBar.trailingAnchor.constraint(equalTo: containerView.trailingAnchor),
      tabBar.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
      tabBar.topAnchor.constraint(greaterThanOrEqualTo: containerView.topAnchor)
    ])

    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(nil)
        return
      }
      if call.method == "setSelectedIndex",
         let index = call.arguments as? Int,
         let items = self.tabBar.items,
         index >= 0 && index < items.count {
        DispatchQueue.main.async {
          self.tabBar.selectedItem = items[index]
        }
        result(nil)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
  }

  func view() -> UIView {
    return containerView
  }

  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    channel.invokeMethod("onTabSelected", arguments: item.tag)
  }
}
