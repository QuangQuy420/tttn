import { randomUuid } from "./uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns crypto.randomUUID() when it is available", () => {
    if (typeof crypto.randomUUID !== "function") {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        writable: true,
        value: () => "00000000-0000-4000-8000-000000000000",
      });
    }
    jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("11111111-2222-4333-8444-555555555555");

    expect(randomUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to a valid v4 UUID built from getRandomValues when randomUUID is missing", () => {
    const descriptor =
      Object.getOwnPropertyDescriptor(crypto, "randomUUID") ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(crypto), "randomUUID");
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      const first = randomUuid();
      const second = randomUuid();

      expect(first).toMatch(UUID_V4);
      expect(second).toMatch(UUID_V4);
      expect(first).not.toBe(second);
    } finally {
      if (descriptor) {
        Object.defineProperty(crypto, "randomUUID", descriptor);
      } else {
        delete (crypto as { randomUUID?: unknown }).randomUUID;
      }
    }
  });
});
