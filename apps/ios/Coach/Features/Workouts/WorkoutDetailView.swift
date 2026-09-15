import CoachCore
import Charts
import SwiftData
import SwiftUI

struct WorkoutDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppEnvironment.self) private var env
    let workoutID: PersistentIdentifier

    @State private var heartRate: [HeartRateSample] = []
    @State private var heartRateError: String?

    private var workout: Workout? { context.model(for: workoutID) as? Workout }

    var body: some View {
        if let workout {
            content(for: workout)
                .navigationTitle(workout.sport.label)
                .navigationBarTitleDisplayMode(.inline)
                .task(id: workout.startedAt) {
                    await loadHeartRate(for: workout)
                }
        } else {
            ContentUnavailableView("Séance introuvable", systemImage: "questionmark.circle")
        }
    }

    private func content(for w: Workout) -> some View {
        List {
            Section {
                VStack(spacing: 6) {
                    Image(systemName: w.sport.symbol)
                        .font(.system(size: 44))
                        .foregroundStyle(.tint)
                    Text(w.startedAt, format: .dateTime.weekday(.wide).day().month(.wide).year().hour().minute())
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .listRowBackground(Color.clear)

            Section {
                HStack(spacing: 12) {
                    StatTile(title: "Durée", value: Format.duration(w.durationSec))
                    StatTile(title: "Distance", value: Format.distance(w.distanceM))
                    StatTile(title: w.sport.usesPace ? "Allure" : "Vitesse",
                             value: w.sport.usesPace ? Format.pace(w.avgPaceSecPerKm) : Format.speed(distanceM: w.distanceM, durationSec: w.durationSec))
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            if !heartRate.isEmpty {
                Section("Fréquence cardiaque") {
                    HeartRateChart(samples: heartRate, avg: w.avgHr)
                        .frame(height: 180)
                }
            } else if let heartRateError {
                Section("Fréquence cardiaque") {
                    Text(heartRateError).font(.footnote).foregroundStyle(.secondary)
                }
            }

            Section("Détails") {
                row("Dénivelé +", Format.elevation(w.ascentM))
                row("Dénivelé −", Format.elevation(w.descentM))
                row("FC moyenne", Format.heartRate(w.avgHr))
                row("FC max", Format.heartRate(w.maxHr))
                row("Énergie active", Format.energy(w.energyKcal))
                row("Type HealthKit", w.activityType.replacingOccurrences(of: "HKWorkoutActivityType", with: ""))
                row("Source", w.sourceName ?? w.deviceName ?? "–")
                row("Synchronisée", w.syncedAt.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "en attente")
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        LabeledContent(label, value: value)
    }

    private func loadHeartRate(for w: Workout) async {
        do {
            heartRate = try await env.health.heartRateSeries(from: w.startedAt, to: w.endedAt)
            heartRateError = heartRate.isEmpty ? "Aucun échantillon de fréquence cardiaque." : nil
        } catch {
            heartRateError = error.localizedDescription
        }
    }
}

private struct HeartRateChart: View {
    let samples: [HeartRateSample]
    let avg: Double?

    var body: some View {
        Chart {
            ForEach(samples) { s in
                LineMark(x: .value("Temps", s.date), y: .value("bpm", s.bpm))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(.red)
            }
            if let avg {
                RuleMark(y: .value("Moyenne", avg))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text("moy. \(Int(avg)) bpm").font(.caption2).foregroundStyle(.secondary)
                    }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine()
                AxisValueLabel(format: .dateTime.hour().minute())
            }
        }
        .accessibilityLabel("Courbe de fréquence cardiaque")
    }
}

#Preview {
    let container = PreviewData.container()
    let env = AppEnvironment.preview(modelContainer: container)
    let first = try! container.mainContext.fetch(FetchDescriptor<Workout>(sortBy: [SortDescriptor(\.startedAt, order: .reverse)])).first!
    NavigationStack {
        WorkoutDetailView(workoutID: first.persistentModelID)
    }
    .environment(env)
    .modelContainer(container)
}
