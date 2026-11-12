// swift-tools-version:5.9
// The extension's decrypt logic as a package, so `swift test` checks it against core's vectors.json
// on the Mac (scripts/verify.sh); the extension target compiles Sources/MesaNotice directly.
import PackageDescription

let package = Package(
  name: "MesaNotice",
  platforms: [.macOS(.v13), .iOS(.v16)],
  products: [.library(name: "MesaNotice", targets: ["MesaNotice"])],
  targets: [
    .target(name: "MesaNotice"),
    .testTarget(name: "MesaNoticeTests", dependencies: ["MesaNotice"]),
  ]
)
