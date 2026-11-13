// Holds the extension to core's vectors.json, the same fixed inputs core's protocol.test.ts checks.
import CryptoKit
import Foundation
import XCTest

@testable import MesaNotice

private struct Vectors: Decodable {
  let pairingId, macPublicKey, phonePrivateKey, macToPhoneKey: String
  let plaintext, macToPhoneBox, noticePlaintext, macToPhoneNotice: String
}

private let vectors: Vectors = {
  let file = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("../../../../../../packages/core/src/phone/protocol/vectors.json")
    .standardized
  return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: file))
}()

private func key(pairingId: String = vectors.pairingId) -> SymmetricKey {
  macToPhoneKey(
    privateKey: vectors.phonePrivateKey, macKey: vectors.macPublicKey, pairingId: pairingId)!
}

final class VectorsTests: XCTestCase {
  func testDerivesTheMacToPhoneKey() {
    XCTAssertEqual(key().withUnsafeBytes { Data($0) }, fromBase64url(vectors.macToPhoneKey))
  }

  func testOpensTheBoxAndTheNotice() {
    XCTAssertEqual(
      open(vectors.macToPhoneBox, key: key(), pairingId: vectors.pairingId), vectors.plaintext)
    XCTAssertEqual(
      open(vectors.macToPhoneNotice, key: key(), pairingId: vectors.pairingId),
      vectors.noticePlaintext)
    XCTAssertEqual(
      openNotice(vectors.macToPhoneNotice, key: key(), pairingId: vectors.pairingId),
      Notice(title: "Fix the login bug", body: "mesa: asks a question", session: "k3m9q2xz"))
  }

  func testOpensWithThePairingAsTheAppKeepsIt() throws {
    let pairing = try JSONSerialization.data(withJSONObject: [
      "broker": "https://broker.example.test", "pairingId": vectors.pairingId,
      "phoneToken": "t", "privateKey": vectors.phonePrivateKey, "macKey": vectors.macPublicKey,
      "sentSeq": 1, "takenSeq": 0,
    ])
    XCTAssertEqual(
      openNotice(vectors.macToPhoneNotice, pairing: pairing)?.notice.title, "Fix the login bug")
    XCTAssertEqual(
      openNotice(vectors.macToPhoneNotice, pairing: pairing)?.pairingId, vectors.pairingId)
    XCTAssertNil(openNotice(vectors.macToPhoneNotice, pairing: Data("{}".utf8)))
  }

  func testRefusesAFlippedByteAnotherPairingOrABoxThatIsNoNotice() {
    var bytes = fromBase64url(vectors.macToPhoneNotice)!
    bytes[20] ^= 1
    let flipped = bytes.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    XCTAssertNil(openNotice(flipped, key: key(), pairingId: vectors.pairingId))
    let other = "AnotherPairing00000000"
    XCTAssertNil(openNotice(vectors.macToPhoneNotice, key: key(pairingId: other), pairingId: other))
    XCTAssertNil(openNotice(vectors.macToPhoneNotice, key: key(), pairingId: other))
    XCTAssertNil(openNotice(vectors.macToPhoneBox, key: key(), pairingId: vectors.pairingId))
    XCTAssertNil(openNotice("not base64!", key: key(), pairingId: vectors.pairingId))
  }
}
