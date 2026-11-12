// Opens a sealed notice (#1016) the way core's packages/core/src/phone/protocol/ does: X25519,
// HKDF-SHA256 for the Mac-to-phone key, ChaCha20-Poly1305 bound to the pairing id. The second
// implementation ADR-0027 allows, held to the same vectors.json.
import CryptoKit
import Foundation

/// What a push shows once opened.
public struct Notice: Equatable {
  public let title: String
  public let body: String
  /// The Mesa session it is about, for a tap to open.
  public var session: String? = nil
}

/// Bytes of base64url text, or nil when it is not base64url.
func fromBase64url(_ text: String) -> Data? {
  var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
  return Data(base64Encoded: base64)
}

/// The key the Mac seals with for the phone, from the phone's private key and the Mac's public one.
public func macToPhoneKey(privateKey: String, macKey: String, pairingId: String) -> SymmetricKey? {
  guard let secret = fromBase64url(privateKey), let peer = fromBase64url(macKey),
    let mine = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: secret),
    let theirs = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: peer),
    let shared = try? mine.sharedSecretFromKeyAgreement(with: theirs)
  else { return nil }
  return shared.hkdfDerivedSymmetricKey(
    using: SHA256.self, salt: Data(pairingId.utf8),
    sharedInfo: Data("mesa-phone/v1 mac-to-phone".utf8), outputByteCount: 32)
}

/// Opens a box: nonce, ciphertext and tag, sealed for this pairing.
public func open(_ box: String, key: SymmetricKey, pairingId: String) -> String? {
  guard let bytes = fromBase64url(box), bytes.count >= 28,
    let sealed = try? ChaChaPoly.SealedBox(combined: bytes),
    let text = try? ChaChaPoly.open(
      sealed, using: key, authenticating: Data("mesa-phone/v1 \(pairingId)".utf8))
  else { return nil }
  return String(data: text, encoding: .utf8)
}

private struct Sealed: Decodable {
  let v: Int
  let kind: String
  let title: String
  let body: String
  let session: String?
}

/// The notice in a box, or nil when it does not open or is not a notice.
public func openNotice(_ box: String, key: SymmetricKey, pairingId: String) -> Notice? {
  guard let text = open(box, key: key, pairingId: pairingId),
    let sealed = try? JSONDecoder().decode(Sealed.self, from: Data(text.utf8)),
    sealed.v == 1, sealed.kind == "notice"
  else { return nil }
  return Notice(title: sealed.title, body: sealed.body, session: sealed.session)
}

/// What the extension reads of the phone's pairing in the Keychain (core's PhonePairing).
public struct Pairing: Decodable {
  public let pairingId: String
  public let privateKey: String
  public let macKey: String
}

/// The notice in a push's box, opened with the pairing's JSON as the app keeps it.
public func openNotice(_ box: String, pairing json: Data) -> Notice? {
  guard let pairing = try? JSONDecoder().decode(Pairing.self, from: json),
    let key = macToPhoneKey(
      privateKey: pairing.privateKey, macKey: pairing.macKey, pairingId: pairing.pairingId)
  else { return nil }
  return openNotice(box, key: key, pairingId: pairing.pairingId)
}
