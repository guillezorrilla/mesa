// The Notification Service Extension (#1016, ADR-0027): the broker's push carries a fixed alert and
// the sealed notice in `n`; this opens it with the pairing the app keeps in the shared Keychain
// group and shows the session's real title and body, with its session id in userInfo for a tap.
// Anything that fails leaves the fixed alert.
import Foundation
import Security
import UserNotifications

/// Where the app keeps its pairing: expo-secure-store's item (service `app:no-auth`, account the
/// key's bytes) in the access group the app and this extension share. The app's
/// src/features/pairing/pairingStore.ts owns the key and group; app.config.ts the entitlement.
private let pairingQuery: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: "app:no-auth",
  kSecAttrAccount as String: Data("mesa.pairing".utf8),
  kSecAttrAccessGroup as String: "EMTB6K854Q.com.guillezorrilla.mesa",
  kSecReturnData as String: true,
]

private func storedPairing() -> Data? {
  var item: CFTypeRef?
  guard SecItemCopyMatching(pairingQuery as CFDictionary, &item) == errSecSuccess else { return nil }
  return item as? Data
}

final class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var fixed: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    fixed = request.content
    guard let box = request.content.userInfo["n"] as? String, let pairing = storedPairing(),
      let notice = openNotice(box, pairing: pairing),
      let content = request.content.mutableCopy() as? UNMutableNotificationContent
    else { return finish(request.content) }
    content.title = notice.title
    content.body = notice.body
    // The app opens this session when the notification is tapped.
    if let session = notice.session { content.userInfo["session"] = session }
    finish(content)
  }

  /// Should the Keychain keep it past its time, the fixed alert goes out rather than nothing.
  override func serviceExtensionTimeWillExpire() {
    if let fixed { finish(fixed) }
  }

  /// Hands the system one content, once.
  private func finish(_ content: UNNotificationContent) {
    deliver?(content)
    deliver = nil
  }
}
