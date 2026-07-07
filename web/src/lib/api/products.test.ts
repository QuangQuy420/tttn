import { apiFetch } from "./client";
import { getCategories, getProductById, getProducts } from "./products";

jest.mock("./client", () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe("products api client", () => {
  afterEach(() => {
    mockedApiFetch.mockReset();
  });

  it("getProducts calls /products with no query string when no filters are given", async () => {
    mockedApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await getProducts();

    expect(mockedApiFetch).toHaveBeenCalledWith("/products");
  });

  it("getProducts serializes categoryId and frameShape filters into the query string", async () => {
    mockedApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await getProducts({ categoryId: "cat-1", frameShape: "AVIATOR", page: 2, limit: 10 });

    const calledPath = mockedApiFetch.mock.calls[0][0] as string;
    expect(calledPath.startsWith("/products?")).toBe(true);
    const query = new URLSearchParams(calledPath.split("?")[1]);
    expect(query.get("categoryId")).toBe("cat-1");
    expect(query.get("frameShape")).toBe("AVIATOR");
    expect(query.get("page")).toBe("2");
    expect(query.get("limit")).toBe("10");
  });

  it("getProducts serializes search, minPrice and maxPrice into the query string", async () => {
    mockedApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await getProducts({ search: "aviator", minPrice: 1_500_000, maxPrice: 2_500_000 });

    const calledPath = mockedApiFetch.mock.calls[0][0] as string;
    expect(calledPath.startsWith("/products?")).toBe(true);
    const query = new URLSearchParams(calledPath.split("?")[1]);
    expect(query.get("search")).toBe("aviator");
    expect(query.get("minPrice")).toBe("1500000");
    expect(query.get("maxPrice")).toBe("2500000");
  });

  it("getProductById calls /products/:id with the given id", async () => {
    mockedApiFetch.mockResolvedValue({ id: "abc" });

    await getProductById("abc");

    expect(mockedApiFetch).toHaveBeenCalledWith("/products/abc");
  });

  it("getCategories calls /categories", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await getCategories();

    expect(mockedApiFetch).toHaveBeenCalledWith("/categories");
  });
});
