import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useRouter: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getAccessToken: jest.fn() }));
jest.mock("@/lib/api", () => ({
  getWishlistProductIds: jest.fn(),
  addToWishlist: jest.fn(),
  removeFromWishlist: jest.fn(),
}));

import { useRouter } from "next/navigation";
import { addToWishlist, getWishlistProductIds, removeFromWishlist } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { useWishlist } from "./useWishlist";

const mockedGetIds = getWishlistProductIds as jest.Mock;
const mockedAdd = addToWishlist as jest.Mock;
const mockedRemove = removeFromWishlist as jest.Mock;
const mockedGetToken = getAccessToken as jest.Mock;
const push = jest.fn();

// useWishlist keeps a module-level store shared across tests. Each logged-in test uses its own
// token, which forces the store to reload the liked ids (mocked to []) on mount; the logged-out
// test has no token, which clears the store.
function load() {
  (useRouter as jest.Mock).mockReturnValue({ push });
  return {
    api: { getWishlistProductIds: mockedGetIds, addToWishlist: mockedAdd, removeFromWishlist: mockedRemove },
    session: { getAccessToken: mockedGetToken },
    push,
    useWishlist,
  };
}

describe("useWishlist", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("logged in: toggle likes optimistically (isLiked true before the API resolves)", async () => {
    const { api, session, useWishlist } = load();
    session.getAccessToken.mockReturnValue("token-1");
    api.getWishlistProductIds.mockResolvedValue([]);
    let resolveAdd!: (value: unknown) => void;
    api.addToWishlist.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));

    const { result } = renderHook(() => useWishlist());
    await waitFor(() => expect(api.getWishlistProductIds).toHaveBeenCalledWith("token-1"));

    let togglePromise!: Promise<void>;
    act(() => {
      togglePromise = result.current.toggle("p1");
    });

    expect(result.current.isLiked("p1")).toBe(true);
    expect(api.addToWishlist).toHaveBeenCalledWith("token-1", "p1");

    await act(async () => {
      resolveAdd({ created: true });
      await togglePromise;
    });
    expect(result.current.isLiked("p1")).toBe(true);
  });

  it("logged in: rolls isLiked back to false and rethrows when the API rejects", async () => {
    const { api, session, useWishlist } = load();
    session.getAccessToken.mockReturnValue("token-2");
    api.getWishlistProductIds.mockResolvedValue([]);
    api.addToWishlist.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useWishlist());
    await waitFor(() => expect(api.getWishlistProductIds).toHaveBeenCalledWith("token-2"));

    await act(async () => {
      await expect(result.current.toggle("p1")).rejects.toThrow("boom");
    });

    expect(result.current.isLiked("p1")).toBe(false);
  });

  it("logged out: toggle redirects to /login without calling the API", async () => {
    const { api, session, push, useWishlist } = load();
    session.getAccessToken.mockReturnValue(null);

    const { result } = renderHook(() => useWishlist());

    await act(async () => {
      await result.current.toggle("p1");
    });

    expect(push).toHaveBeenCalledWith("/login");
    expect(api.addToWishlist).not.toHaveBeenCalled();
    expect(result.current.isLiked("p1")).toBe(false);
  });
});
