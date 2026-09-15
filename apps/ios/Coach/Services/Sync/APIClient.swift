import CoachCore
import Foundation

/// Configuration réseau lue au moment de chaque requête (l'utilisateur peut la changer dans Réglages).
@MainActor
protocol APIConfiguration: AnyObject {
    var apiBaseURL: URL { get }
    var apiKey: String { get }
}

protocol APIClient: Sendable {
    func send<Body: Encodable & Sendable, Response: Decodable & Sendable>(_ endpoint: APIEndpoint<Body, Response>) async throws -> Response
}

struct APIEndpoint<Body: Encodable & Sendable, Response: Decodable & Sendable>: Sendable {
    var method: String
    var path: String
    var body: Body?
    var requiresKey: Bool
}

enum NetworkError: LocalizedError {
    case invalidURL
    case missingAPIKey
    case http(status: Int, message: String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "URL de l'API invalide."
        case .missingAPIKey: "Clé d'API manquante (Réglages)."
        case let .http(status, message): "Erreur API \(status)\(message.map { " : \($0)" } ?? "")."
        case let .decoding(e): "Réponse illisible : \(e.localizedDescription)"
        case let .transport(e): e.localizedDescription
        }
    }
}

final class URLSessionAPIClient: APIClient, @unchecked Sendable {
    private let configuration: any APIConfiguration
    private let session: URLSession

    init(configuration: any APIConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    func send<Body, Response>(_ endpoint: APIEndpoint<Body, Response>) async throws -> Response {
        let (baseURL, key) = await MainActor.run { (configuration.apiBaseURL, configuration.apiKey) }
        guard let url = URL(string: endpoint.path, relativeTo: baseURL) else { throw NetworkError.invalidURL }
        if endpoint.requiresKey && key.isEmpty { throw NetworkError.missingAPIKey }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if endpoint.requiresKey { request.setValue(key, forHTTPHeaderField: "x-api-key") }
        if let body = endpoint.body { request.httpBody = try APIJSON.encoder.encode(body) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw NetworkError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else { throw NetworkError.transport(URLError(.badServerResponse)) }
        guard (200..<300).contains(http.statusCode) else {
            throw NetworkError.http(status: http.statusCode, message: String(data: data, encoding: .utf8))
        }
        do {
            return try APIJSON.decoder.decode(Response.self, from: data)
        } catch {
            throw NetworkError.decoding(error)
        }
    }
}

/// Pour les previews : n'envoie rien.
struct NoOpAPIClient: APIClient {
    func send<Body, Response>(_ endpoint: APIEndpoint<Body, Response>) async throws -> Response {
        throw NetworkError.transport(URLError(.notConnectedToInternet))
    }
}

enum Endpoints {
    static var health: APIEndpoint<EmptyBody, HealthResponse> {
        .init(method: "GET", path: "/health", body: nil, requiresKey: false)
    }

    static func ingest(_ payload: IngestPayload) -> APIEndpoint<IngestPayload, IngestResponse> {
        .init(method: "POST", path: "/ingest/app", body: payload, requiresKey: true)
    }
}
