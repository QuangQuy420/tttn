const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

// tracker.ts keeps a module-level queue/timer, so every test loads a fresh copy
// (jest.resetModules() runs in beforeEach).
function loadTracker(): Promise<typeof import("./tracker")> {
  return import("./tracker");
}

function mockFetch(impl?: () => Promise<unknown>) {
  const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>(
    impl ?? (() => Promise.resolve({ ok: true, status: 202, json: async () => ({ accepted: 1 }) })),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sentEvents(fetchMock: jest.Mock, call = 0) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return (JSON.parse(init.body as string) as { events: Array<Record<string, unknown>> }).events;
}

describe("tracker.track", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080/api";
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("anonymous visitor (no token): never calls fetch", async () => {
    const fetchMock = mockFetch();
    const { track } = await loadTracker();

    track("VIEW", "p1");
    jest.advanceTimersByTime(10_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logged in: queued events are sent in one batch after the 5 s timer", async () => {
    localStorage.setItem("accessToken", "token-1");
    const fetchMock = mockFetch();
    const { track } = await loadTracker();

    track("VIEW", "p1", { durationMs: 2000 });
    track("TRY_ON", "p2");
    jest.advanceTimersByTime(4999);
    expect(fetchMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/api/events");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        keepalive: false,
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      }),
    );
    const events = sentEvents(fetchMock);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(
      expect.objectContaining({
        eventId: expect.any(String),
        eventType: "VIEW",
        productId: "p1",
        occurredAt: expect.any(String),
        context: expect.objectContaining({ sessionId: expect.any(String), durationMs: 2000 }),
      }),
    );
    expect(events[1]).toEqual(expect.objectContaining({ eventType: "TRY_ON", productId: "p2" }));
    expect(events[0].eventId).not.toBe(events[1].eventId);
  });

  it("logged in: flushes immediately once 10 events are queued", async () => {
    localStorage.setItem("accessToken", "token-1");
    const fetchMock = mockFetch();
    const { track } = await loadTracker();

    for (let i = 0; i < 9; i++) track("VIEW", `p${i}`);
    expect(fetchMock).not.toHaveBeenCalled();

    track("VIEW", "p9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentEvents(fetchMock)).toHaveLength(10);

    // The timer was cleared by the flush — nothing more is sent later.
    jest.advanceTimersByTime(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pagehide flushes the queue right away with keepalive: true", async () => {
    localStorage.setItem("accessToken", "token-1");
    const fetchMock = mockFetch();
    const { track } = await loadTracker();

    track("VIEW", "p1");
    window.dispatchEvent(new Event("pagehide"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ keepalive: true }));
    expect(sentEvents(fetchMock)).toEqual([expect.objectContaining({ productId: "p1" })]);
  });

  it("a failed fetch is swallowed (no throw, one console.warn)", async () => {
    localStorage.setItem("accessToken", "token-1");
    const fetchMock = mockFetch(() => Promise.reject(new TypeError("network down")));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { track } = await loadTracker();

    track("VIEW", "p1");
    expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Let the rejected request settle; an unhandled rejection would fail the test run.
    await Promise.resolve();
    await jest.runAllTimersAsync();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
