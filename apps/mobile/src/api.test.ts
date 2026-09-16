import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** localStorage minimal en mémoire, réinitialisé à chaque test. */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

type Win = { location: { search: string }; localStorage: ReturnType<typeof memoryStorage> };
const g = globalThis as unknown as { window?: Win };

function setWindow(search = "") {
  g.window = { location: { search }, localStorage: memoryStorage() };
}

beforeEach(() => {
  vi.resetModules();
  setWindow();
});

afterEach(() => {
  delete g.window;
  vi.unstubAllGlobals();
});

async function load() {
  return await import("./api");
}

describe("getApiUrl sur le web", () => {
  it("utilise la valeur par défaut sans réglage", async () => {
    const { getApiUrl } = await load();
    expect(getApiUrl()).toBe("http://localhost:3210");
  });

  it("?api= dans l'adresse prime et est mémorisé", async () => {
    setWindow("?api=http://192.168.1.10:3210");
    const { getApiUrl } = await load();
    expect(getApiUrl()).toBe("http://192.168.1.10:3210");
    expect(g.window!.localStorage.getItem("coach.apiUrl")).toBe("http://192.168.1.10:3210");
  });

  it("relit la valeur mémorisée et setApiUrl retire les barres obliques finales", async () => {
    const { getApiUrl, setApiUrl } = await load();
    setApiUrl("http://coach.local:3210///");
    expect(getApiUrl()).toBe("http://coach.local:3210");
  });

  it("retombe sur la valeur par défaut si le stockage lève", async () => {
    g.window!.localStorage.getItem = () => {
      throw new Error("bloqué");
    };
    const { getApiUrl } = await load();
    expect(getApiUrl()).toBe("http://localhost:3210");
  });
});

describe("client api", () => {
  function stubFetch(body: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("construit la query de /workouts sans paramètres vides", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });
    const { api } = await load();
    await api.workouts({ limit: 20, sport: "running" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3210/workouts?limit=20&sport=running");
    await api.workouts();
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:3210/workouts?");
  });

  it("dailyMetrics demande les N derniers jours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    const fetchMock = stubFetch({ items: [] });
    const { api } = await load();
    await api.dailyMetrics(30);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3210/metrics/daily?from=2026-08-16");
    vi.useRealTimers();
  });

  it("propage une erreur explicite sur un statut HTTP non 2xx", async () => {
    stubFetch({}, false, 503);
    const { api } = await load();
    await expect(api.stats()).rejects.toThrow("API 503 sur /stats");
  });

  it("utilise l'URL réglée par l'utilisateur", async () => {
    const fetchMock = stubFetch({});
    const { api, setApiUrl } = await load();
    setApiUrl("http://192.168.1.42:3210");
    await api.workout("abc");
    expect(fetchMock).toHaveBeenCalledWith("http://192.168.1.42:3210/workouts/abc");
  });
});
