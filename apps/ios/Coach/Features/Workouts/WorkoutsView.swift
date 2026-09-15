import CoachCore
import SwiftData
import SwiftUI

/// Liste des séances : recette "pile poussable" (NavigationStack + liens par valeur).
struct WorkoutsView: View {
    @Environment(SyncEngine.self) private var sync
    @State private var filter: Sport?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            WorkoutListView(filter: filter)
                .navigationTitle("Séances")
                .navigationDestination(for: PersistentIdentifier.self) { id in
                    WorkoutDetailView(workoutID: id)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Sport", selection: $filter) {
                                Text("Tous les sports").tag(Sport?.none)
                                ForEach(Sport.filterOrder) { sport in
                                    Label(sport.label, systemImage: sport.symbol).tag(Sport?.some(sport))
                                }
                            }
                        } label: {
                            Label("Filtrer", systemImage: filter == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        }
                    }
                }
                .refreshable { await sync.refresh() }
                .overlay(alignment: .bottom) { SyncStatusBar() }
        }
    }
}

/// Sous-vue dédiée pour que le filtre soit dans la requête SwiftData, pas dans `body`.
private struct WorkoutListView: View {
    @Query private var workouts: [Workout]
    private let filter: Sport?

    init(filter: Sport?) {
        self.filter = filter
        if let raw = filter?.rawValue {
            _workouts = Query(filter: #Predicate<Workout> { $0.sportRaw == raw }, sort: \Workout.startedAt, order: .reverse)
        } else {
            _workouts = Query(sort: \Workout.startedAt, order: .reverse)
        }
    }

    var body: some View {
        List {
            Section {
                WeeklySummaryCard(workouts: workouts)
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            Section(filter?.label ?? "Toutes les séances") {
                if workouts.isEmpty {
                    ContentUnavailableView(
                        "Aucune séance",
                        systemImage: "figure.run",
                        description: Text("Autorisez l'accès à Santé puis tirez pour synchroniser.")
                    )
                } else {
                    ForEach(workouts) { workout in
                        NavigationLink(value: workout.persistentModelID) {
                            WorkoutRow(workout: workout)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}

/// Volume des 7 derniers jours hors routine : ce que le coach considérera comme "entraînement".
private struct WeeklySummaryCard: View {
    let workouts: [Workout]

    private var summary: TrainingVolume {
        RoutineClassifier.trainingVolume(workouts.map(\.draft), since: Date.now.addingTimeInterval(-7 * 86_400))
    }

    var body: some View {
        let s = summary
        HStack(spacing: 12) {
            StatTile(title: "7 jours", value: Format.duration(s.durationSec), detail: "\(s.count) séance\(s.count > 1 ? "s" : "")")
            StatTile(title: "Distance", value: Format.distance(s.distanceM), detail: "\(Format.elevation(s.ascentM)) D+")
        }
        .padding(.vertical, 4)
    }
}

struct StatTile: View {
    let title: String
    let value: String
    var detail: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            if let detail {
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.fill.tertiary, in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

/// Bandeau discret d'état de synchronisation ; disparaît quand tout est calme.
private struct SyncStatusBar: View {
    @Environment(SyncEngine.self) private var sync

    var body: some View {
        Group {
            switch sync.phase {
            case .idle:
                EmptyView()
            case .requestingAccess:
                Label("Demande d'accès à Santé…", systemImage: "heart.text.square")
            case .readingHealth:
                Label("Lecture de Santé…", systemImage: "arrow.triangle.2.circlepath")
            case .pushing:
                Label("Envoi vers l'API (\(sync.pendingPush))…", systemImage: "icloud.and.arrow.up")
            case let .failed(message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            }
        }
        .font(.footnote)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: .capsule)
        .padding(.bottom, 8)
        .animation(.snappy, value: sync.phase)
    }
}

#Preview {
    let container = PreviewData.container()
    let env = AppEnvironment.preview(modelContainer: container)
    WorkoutsView()
        .environment(env)
        .environment(env.sync)
        .modelContainer(container)
}
