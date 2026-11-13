// The Notification Service Extension (#1016, ADR-0027): the broker's push carries a fixed alert and
// the sealed notice in `n`; this opens it with whichever of the pairings the app keeps in the
// shared Keychain group seals it (one per Mac, #1069) and shows the session's real title and body,
// with its session id and that pairing's id in userInfo for a tap. Anything that fails leaves the
// fixed alert.
import Foundation
import Security
import UserNotifications

/// Where the app keeps its pairings: expo-secure-store's items (service `app:no-auth`, account the
/// key's bytes) in the access group the app and this extension share, one per pairing under
/// `mesa.pairing.<id>` (or `mesa.pairing`, before the app moved it). The app's
/// src/features/pairing/pairingKeys.ts owns the keys and pairingStore.ts the group; app.config.ts
/// the entitlement.
private let pairingsQuery: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: "app:no-auth",
  kSecAttrAccessGroup as String: "EMTB6K854Q.com.guillezorrilla.mesa",
  kSecMatchLimit as String: kSecMatchLimitAll,
  kSecReturnAttributes as String: true,
  kSecReturnData as String: true,
]

/// Every pairing's JSON; the index of ids (`mesa.pairings`) is left out.
private func storedPairings() -> [Data] {
  var items: CFTypeRef?
  guard SecItemCopyMatching(pairingsQuery as CFDictionary, &items) == errSecSuccess,
    let found = items as? [[String: Any]]
  else { return [] }
  return found.compactMap { item in
    guard let account = item[kSecAttrAccount as String] as? Data,
      let key = String(data: account, encoding: .utf8),
      key == "mesa.pairing" || key.hasPrefix("mesa.pairing.")
    else { return nil }
    return item[kSecValueData as String] as? Data
  }
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
    guard let box = request.content.userInfo["n"] as? String,
      let opened = storedPairings().lazy.compactMap({ openNotice(box, pairing: $0) }).first,
      let content = request.content.mutableCopy() as? UNMutableNotificationContent
    else { return finish(request.content) }
    content.title = opened.notice.title
    content.body = opened.notice.body
    // The app opens this session, on the Mac whose pairing sealed it, when it is tapped.
    if let session = opened.notice.session { content.userInfo["session"] = session }
    content.userInfo["mac"] = opened.pairingId
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
