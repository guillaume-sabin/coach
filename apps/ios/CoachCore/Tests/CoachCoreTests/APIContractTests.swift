import Foundation
import Testing
@testable import CoachCore

/// Le contrat JSON doit rester compatible avec `apps/api/src/import/app-ingest.ts` (schéma zod).
@Suite("Contrat API")
struct APIContractTests {
    private let start = Date(timeIntervalSince1970: 1_789_491_912) // 2026-09-15T17:05:12Z

    private var runDraft: WorkoutDraft {
        WorkoutDraft(
            startedAt: start, endedAt: start.addingTimeInterval(3208), healthKitUUID: UUID(uuidString: "0B3C1F7A-1111-2222-3333-444455556666"),
            activityType: "HKWorkoutActivityTypeRunning", sport: .running, durationSec: 3208, distanceM: 10_120, ascentM: 94, descentM: 90,
            avgHr: 146, maxHr: 171, energyKcal: 690, sourceName: "Apple Watch de Guillaume", deviceName: "Apple Watch"
        )
    }

    private func encodeJSON<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try APIJSON.encoder.encode(value)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }

    @Test("Le payload iOS est encodé comme l'API l'attend")
    func encodesPayload() throws {
        let data = try APIJSON.encoder.encode(IngestPayload(workouts: [WorkoutPayload(draft: runDraft)], metrics: []))
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"source\":\"ios_app\""))
        #expect(json.contains("\"sport\":\"running\""))
        #expect(json.contains("\"startedAt\":\"2026-09-15T17:05:12Z\""))
        #expect(json.contains("\"endedAt\":\"2026-09-15T17:58:40Z\""))
        // 3208 s / 10,12 km = 316,996… : l'API arrondit à l'affichage, le payload garde la valeur exacte.
        #expect(json.contains("\"avgPaceSecPerKm\":316.99"))
        #expect(json.contains("\"sourceId\":\"0B3C1F7A-1111-2222-3333-444455556666\""))
        #expect(json.contains("\"metrics\":[]"))
    }

    @Test("Le nom de la source prime sur celui de l'appareil pour deviceName")
    func deviceNamePrefersSource() throws {
        var d = runDraft
        #expect(try encodeJSON(WorkoutPayload(draft: d))["deviceName"] as? String == "Apple Watch de Guillaume")
        d.sourceName = nil
        #expect(try encodeJSON(WorkoutPayload(draft: d))["deviceName"] as? String == "Apple Watch")
        d.deviceName = nil
        #expect(try encodeJSON(WorkoutPayload(draft: d))["deviceName"] == nil)
    }

    @Test("Les optionnels absents ne sont pas encodés (zod nullish les accepte)")
    func nilFieldsOmitted() throws {
        let d = WorkoutDraft(startedAt: start, endedAt: start.addingTimeInterval(600), activityType: "HKWorkoutActivityTypeCooldown", sport: .mobility, durationSec: 600)
        let obj = try encodeJSON(WorkoutPayload(draft: d))
        let expectedKeys: Set<String> = ["source", "sport", "activityType", "startedAt", "endedAt", "durationSec"]
        #expect(Set(obj.keys) == expectedKeys)
    }

    @Test("Les clés sont triées : encodage déterministe pour les comparaisons et les journaux")
    func sortedKeys() throws {
        let data = try APIJSON.encoder.encode(DailyMetricPayload(draft: DailyMetricDraft(day: "2026-09-15", hrvMs: 104, restingHr: 41, sleepMinutes: 466, steps: 9210)))
        #expect(String(decoding: data, as: UTF8.self) == #"{"date":"2026-09-15","hrvMs":104,"restingHr":41,"sleepMinutes":466,"steps":9210}"#)
    }

    @Test("Les réponses de l'API se décodent")
    func decodesResponses() throws {
        let health = try APIJSON.decoder.decode(HealthResponse.self, from: Data(#"{"ok":true,"now":"2026-09-15T18:00:00.000Z"}"#.utf8))
        #expect(health.ok)
        let ingest = try APIJSON.decoder.decode(IngestResponse.self, from: Data(#"{"ok":true,"workouts":2,"metrics":1}"#.utf8))
        #expect(ingest.ok && ingest.workouts == 2 && ingest.metrics == 1)
    }

    @Test("Le décodeur lit les dates ISO 8601 renvoyées par l'API")
    func decodesDates() throws {
        struct Probe: Decodable { var at: Date }
        let p = try APIJSON.decoder.decode(Probe.self, from: Data(#"{"at":"2026-09-15T17:05:12Z"}"#.utf8))
        #expect(p.at == start)
    }

    @Test("EmptyBody s'encode en objet vide")
    func emptyBody() throws {
        #expect(String(decoding: try APIJSON.encoder.encode(EmptyBody()), as: UTF8.self) == "{}")
    }
}
