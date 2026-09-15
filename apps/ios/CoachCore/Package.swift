// swift-tools-version: 6.0
// Logique métier de Coach, sans aucun framework Apple : compile et se teste sur Windows, Linux et macOS.
import PackageDescription

let package = Package(
    name: "CoachCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "CoachCore", targets: ["CoachCore"]),
    ],
    targets: [
        .target(name: "CoachCore"),
        .testTarget(name: "CoachCoreTests", dependencies: ["CoachCore"]),
    ]
)
