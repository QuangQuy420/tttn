import { act, renderHook } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePageParam } from "./usePageParam";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

const push = jest.fn();

function setup(query: string) {
  (useRouter as jest.Mock).mockReturnValue({ push });
  (usePathname as jest.Mock).mockReturnValue("/products");
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
}

describe("usePageParam", () => {
  afterEach(() => {
    push.mockReset();
  });

  it("reads the page from ?page= and defaults to 1 when missing", () => {
    setup("page=3&sort=price");
    expect(renderHook(() => usePageParam()).result.current[0]).toBe(3);

    setup("");
    expect(renderHook(() => usePageParam()).result.current[0]).toBe(1);
  });

  it("writes ?page= while keeping other params, and drops it for page 1", () => {
    setup("sort=price&page=2");
    const { result } = renderHook(() => usePageParam());

    act(() => result.current[1](4));
    expect(push).toHaveBeenLastCalledWith("/products?sort=price&page=4");

    act(() => result.current[1](1));
    expect(push).toHaveBeenLastCalledWith("/products?sort=price");
  });
});
