import CoachCore
import Charts
import SwiftData
import SwiftUI

/// Récupération : 7 derniers jours comparés aux 4 semaines précédentes, puis tendance HRV.
struct RecoveryView: View {
    @Query(sort: \DailyMetric.day, order: .reverse) private var metrics: [DailyMetric]

    private var recent: [DailyMetric] { Array(metrics.prefix(7)) }
    private var baseline: [DailyMetric] { Array(metrics.dropFirst(7).prefix(28)) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        DeltaTile(title: "HRV", unit: "ms", now: avg(recent, \.hrvMs), base: avg(baseline, \.hrvMs), higherIsBetter: true)
                        DeltaTile(title: "FC repos", unit: "bpm", now: avg(recent, \.restingHr), base: avg(baseline, \.restingHr), higherIsBetter: false)
                        DeltaTile(title: "Sommeil", unit: "min", now: avg(recent, \.sleepMinutes), base: avg(baseline, \.sleepMinutes), higherIsBetter: true)
                        DeltaTile(title: "VO₂max", unit: "", now: metrics.first(where: { $0.vo2max != nil })?.vo2max, base: nil, higherIsBetter: true, digits: 1)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                } footer: {
                    Text("Moyenne des 7 derniers jours comparée aux 4 semaines précédentes.")
                }

                if metrics.contains(where: { $0.hrvMs != nil }) {
                    Section("HRV, 30 jours") {
                        HRVChart(metrics: Array(metrics.prefix(30)))
                            .frame(height: 160)
                    }
                }

                Section("Jour par jour") {
                    if metrics.isEmpty {
                        ContentUnavailableView("Aucune métrique", systemImage: "bed.double", description: Text("Les données arrivent avec la première synchronisation."))
                    }
                    ForEach(metrics.prefix(30)) { m in
                        DayRow(metric: m)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Récupération")
        }
    }

    private func avg(_ items: [DailyMetric], _ key: KeyPath<DailyMetric, Double?>) -> Double? {
        let values = items.compactMap { $0[keyPath: key] }
        return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }
}

private struct DeltaTile: View {
    let title: String
    let unit: String
    let now: Double?
    let base: Double?
    let higherIsBetter: Bool
    var digits = 0

    private var delta: Double? {
        guard let now, let base else { return nil }
        return now - base
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            Text(unit == "min" ? Format.sleep(now) : "\(Format.number(now, digits: digits)) \(unit)")
                .font(.title2.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            if let delta {
                let good = higherIsBetter ? delta >= 0 : delta <= 0
                Text("\(delta >= 0 ? "+" : "")\(Format.number(delta, digits: digits)) \(unit) vs 4 sem.")
                    .font(.footnote)
                    .foregroundStyle(good ? .green : .red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.fill.tertiary, in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

private struct HRVChart: View {
    let metrics: [DailyMetric]

    var body: some View {
        Chart(metrics.filter { $0.hrvMs != nil && $0.date != nil }) { m in
            LineMark(x: .value("Jour", m.date!), y: .value("HRV", m.hrvMs!))
                .interpolationMethod(.catmullRom)
            PointMark(x: .value("Jour", m.date!), y: .value("HRV", m.hrvMs!))
                .symbolSize(18)
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .chartYAxisLabel("ms")
        .accessibilityLabel("Évolution de la variabilité cardiaque sur 30 jours")
    }
}

private struct DayRow: View {
    let metric: DailyMetric

    var body: some View {
        HStack {
            Text(metric.date.map { $0.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) } ?? metric.day)
                .frame(maxWidth: .infinity, alignment: .leading)
            Group {
                Text(Format.number(metric.hrvMs))
                Text(Format.number(metric.restingHr))
                Text(Format.sleep(metric.sleepMinutes))
            }
            .font(.subheadline.monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(width: 58, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(metric.day) : HRV \(Format.number(metric.hrvMs)) ms, FC repos \(Format.number(metric.restingHr)), sommeil \(Format.sleep(metric.sleepMinutes))")
    }
}

#Preview {
    RecoveryView().modelContainer(PreviewData.container())
}
