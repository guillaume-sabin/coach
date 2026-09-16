import Foundation
import Testing
@testable import CoachCore

/// Cas partagés avec l'API : `_context/samples/sport-classification-cases.json`.
/// Un même type d'activité doit donner le même sport côté iOS et côté serveur.
struct FixtureCase: Decodable, CustomTestStringConvertible {
    var activityType: String
    var distanceM: Double?
    var ascentM: Double?
    var expected: String
    var note: String?

    var testDescription: String { "\(activityType) (\(distanceM.map { "\(Int($0)) m" } ?? "–"), \(ascentM.map { "\(Int($0)) m D+" } ?? "–")) => \(expected)" }
}

struct Fixture: Decodable {
    var cases: [FixtureCase]
}

let fixture: Fixture = {
    // …/apps/ios/CoachCore/Tests/CoachCoreTests/SportClassifierTests.swift -> racine du dépôt (6 niveaux).
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<6 { url.deleteLastPathComponent() }
    url.appendPathComponent("_context/samples/sport-classification-cases.json")
    let data = try! Data(contentsOf: url)
    return try! JSONDecoder().decode(Fixture.self, from: data)
}()

@Suite("Classification des sports (fixture partagée avec l'API)")
struct SportFixtureTests {
    @Test("Chaque cas de la fixture", arguments: fixture.cases)
    func fixtureCase(_ c: FixtureCase) {
        let sport = SportClassifier.sport(forActivityType: c.activityType, distanceM: c.distanceM, ascentM: c.ascentM)
        #expect(sport.rawValue == c.expected, "\(c.note ?? "")")
    }

    @Test("La fixture couvre chaque sport au moins une fois")
    func fixtureCoversAllSports() {
        let covered = Set(fixture.cases.map(\.expected))
        for sport in Sport.allCases {
            #expect(covered.contains(sport.rawValue), "sport \(sport.rawValue) absent de la fixture")
        }
    }
}

@Suite("Sports et heuristiques")
struct SportClassifierTests {
    @Test("Heuristique trail : 940 m de D+ sur 18,3 km")
    func trailHeuristic() {
        #expect(SportClassifier.sport(forActivityType: "HKWorkoutActivityTypeRunning", distanceM: 18_300, ascentM: 940) == .trailRunning)
        #expect(SportClassifier.sport(forActivityType: "HKWorkoutActivityTypeRunning", distanceM: 10_420, ascentM: 86) == .running)
    }

    @Test("refineTrail ne requalifie que la course", arguments: Sport.allCases.filter { $0 != .running })
    func refineTrailOnlyRunning(sport: Sport) {
        #expect(SportClassifier.refineTrail(sport, distanceM: 10_000, ascentM: 2_000) == sport)
    }

    @Test("refineTrail ignore les distances absentes ou inférieures à 1 km")
    func refineTrailGuards() {
        #expect(SportClassifier.refineTrail(.running, distanceM: nil, ascentM: 500) == .running)
        #expect(SportClassifier.refineTrail(.running, distanceM: 999, ascentM: 500) == .running)
        #expect(SportClassifier.refineTrail(.running, distanceM: 1000, ascentM: nil) == .running)
        #expect(SportClassifier.refineTrail(.running, distanceM: 1000, ascentM: 25) == .trailRunning)
    }

    @Test("Chaque sport a un libellé, un symbole et un identifiant stable")
    func metadata() {
        for sport in Sport.allCases {
            #expect(!sport.label.isEmpty)
            #expect(!sport.symbol.isEmpty)
            #expect(sport.id == sport.rawValue)
        }
    }

    @Test("Routine et allure")
    func flags() {
        #expect(Sport.allCases.filter(\.isRoutine) == [.mobility, .stretching])
        #expect(Sport.allCases.filter(\.usesPace) == [.running, .trailRunning])
    }

    @Test("Les valeurs brutes correspondent à l'énumération zod de packages/shared")
    func rawValuesMatchAPI() {
        let expected = ["running", "trail_running", "hiking", "walking", "cycling", "swimming", "strength", "mobility", "stretching", "other"]
        #expect(Sport.allCases.map(\.rawValue) == expected)
    }

    @Test("L'ordre des filtres ne contient pas de doublon et exclut « other »")
    func filterOrder() {
        #expect(Set(Sport.filterOrder).count == Sport.filterOrder.count)
        #expect(!Sport.filterOrder.contains(.other))
    }
}
