import CoachCore
import SwiftUI

struct WorkoutRow: View {
    let workout: Workout

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: workout.sport.symbol)
                .font(.title3)
                .frame(width: 40, height: 40)
                .background(.tint.opacity(0.12), in: .rect(cornerRadius: 10))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(workout.sport.label).font(.headline)
                    Spacer()
                    Text(workout.startedAt, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(metrics.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var metrics: [String] {
        var parts = [Format.duration(workout.durationSec)]
        if let d = workout.distanceM, d >= 100 { parts.append(Format.distance(d)) }
        if let a = workout.ascentM, a > 20 { parts.append("\(Format.elevation(a)) D+") }
        if workout.sport.usesPace, let p = workout.avgPaceSecPerKm { parts.append(Format.pace(p)) }
        if let hr = workout.avgHr { parts.append(Format.heartRate(hr)) }
        return parts
    }
}
