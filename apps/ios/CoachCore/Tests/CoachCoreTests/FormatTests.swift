import Foundation
import Testing
@testable import CoachCore

@Suite("Formats d'affichage")
struct FormatTests {
    @Test("Durées", arguments: [
        (0.0, "0 min"),
        (1_500.0, "25 min"),
        (3_599.0, "59 min"),
        (3_599.6, "1 h 00"),
        (3_600.0, "1 h 00"),
        (5_400.0, "1 h 30"),
        (9_330.0, "2 h 35"),
    ])
    func duration(seconds: Double, expected: String) {
        #expect(Format.duration(seconds) == expected)
    }

    @Test("Distances", arguments: [
        (15_000.0, "15.0 km"),
        (10_000.0, "10.0 km"),
        (9_999.0, "10.00 km"),
        (5_200.0, "5.20 km"),
        (18_300.0, "18.3 km"),
    ])
    func distance(meters: Double, expected: String) {
        #expect(Format.distance(meters) == expected)
    }

    @Test("Allures", arguments: [
        (300.0, "5:00 /km"),
        (316.996, "5:17 /km"),
        (359.6, "6:00 /km"),
        (59.4, "0:59 /km"),
    ])
    func pace(secPerKm: Double, expected: String) {
        #expect(Format.pace(secPerKm) == expected)
    }

    @Test("Valeurs absentes ou non finies : tiret")
    func missingValues() {
        #expect(Format.distance(nil) == "–")
        #expect(Format.elevation(nil) == "–")
        #expect(Format.heartRate(nil) == "–")
        #expect(Format.pace(nil) == "–")
        #expect(Format.pace(.infinity) == "–")
        #expect(Format.pace(.nan) == "–")
        #expect(Format.speed(distanceM: nil, durationSec: 100) == "–")
        #expect(Format.speed(distanceM: 1000, durationSec: 0) == "–")
        #expect(Format.energy(nil) == "–")
        #expect(Format.sleep(nil) == "–")
        #expect(Format.number(nil) == "–")
    }

    @Test("Autres formats")
    func misc() {
        #expect(Format.elevation(123.4) == "123 m")
        #expect(Format.heartRate(146.6) == "147 bpm")
        #expect(Format.speed(distanceM: 10_000, durationSec: 3_600) == "10.0 km/h")
        #expect(Format.energy(689.5) == "690 kcal")
        #expect(Format.sleep(466) == "7 h 46")
        #expect(Format.sleep(59.6) == "1 h 00")
        #expect(Format.number(65.234) == "65")
        #expect(Format.number(65.234, digits: 1) == "65.2")
    }
}

@Suite("Allure")
struct PaceTests {
    @Test("Calcul en s/km")
    func compute() {
        #expect(Pace.secondsPerKm(distanceM: 10_000, durationSec: 3_000) == 300)
        let p = Pace.secondsPerKm(distanceM: 10_120, durationSec: 3_208)!
        #expect(abs(p - 316.996) < 0.001)
    }

    @Test("Nil sous 100 m ou sans durée positive")
    func guards() {
        #expect(Pace.secondsPerKm(distanceM: nil, durationSec: 600) == nil)
        #expect(Pace.secondsPerKm(distanceM: 99, durationSec: 600) == nil)
        #expect(Pace.secondsPerKm(distanceM: 100, durationSec: 600) == 6000)
        #expect(Pace.secondsPerKm(distanceM: 5_000, durationSec: 0) == nil)
        #expect(Pace.secondsPerKm(distanceM: 5_000, durationSec: -1) == nil)
    }
}
