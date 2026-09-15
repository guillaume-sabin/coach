import Foundation

/// Formatage centralisé, sans `MeasurementFormatter` ni `FormatStyle` pour rester portable sur toutes les plateformes.
public enum Format {
    public static func duration(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        let h = total / 3600
        let m = (total % 3600) / 60
        return h > 0 ? "\(h) h \(String(format: "%02d", m))" : "\(m) min"
    }

    public static func distance(_ meters: Double?) -> String {
        guard let meters else { return "–" }
        let km = meters / 1000
        return meters >= 10_000 ? String(format: "%.1f km", km) : String(format: "%.2f km", km)
    }

    public static func elevation(_ meters: Double?) -> String {
        guard let meters else { return "–" }
        return "\(Int(meters.rounded())) m"
    }

    public static func heartRate(_ bpm: Double?) -> String {
        guard let bpm else { return "–" }
        return "\(Int(bpm.rounded())) bpm"
    }

    public static func pace(_ secPerKm: Double?) -> String {
        guard let secPerKm, secPerKm.isFinite else { return "–" }
        let total = Int(secPerKm.rounded())
        return "\(total / 60):\(String(format: "%02d", total % 60)) /km"
    }

    public static func speed(distanceM: Double?, durationSec: Double) -> String {
        guard let distanceM, durationSec > 0 else { return "–" }
        return String(format: "%.1f km/h", (distanceM / 1000) / (durationSec / 3600))
    }

    public static func energy(_ kcal: Double?) -> String {
        guard let kcal else { return "–" }
        return "\(Int(kcal.rounded())) kcal"
    }

    public static func sleep(_ minutes: Double?) -> String {
        guard let minutes else { return "–" }
        let total = Int(minutes.rounded())
        return "\(total / 60) h \(String(format: "%02d", total % 60))"
    }

    public static func number(_ value: Double?, digits: Int = 0) -> String {
        guard let value else { return "–" }
        return String(format: "%.\(digits)f", value)
    }
}
