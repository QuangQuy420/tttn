import { apiFetchData, apiFetchPage } from "./client";
import { getCategories, getProductById, getProducts, uploadProductImage } from "./products";

jest.mock("./client", () => ({
  apiFetch: jest.fn(),
  apiFetchData: jest.fn(),
  apiFetchPage: jest.fn(),
}));

const mockedApiFetchData = apiFetchData as jest.Mock;
const mockedApiFetchPage = apiFetchPage as jest.Mock;
const emptyPage = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

describe("products api client", () => {
  afterEach(() => {
    mockedApiFetchData.mockReset();
    mockedApiFetchPage.mockReset();
  });

  it("getProducts calls /products with no query string when no filters are given", async () => {
    mockedApiFetchPage.mockResolvedValue(emptyPage);

    await getProducts();

    expect(mockedApiFetchPage).toHaveBeenCalledWith("/products");
  });

  it("getProducts serializes categoryId, brandId and frameShape filters into the query string", async () => {
    mockedApiFetchPage.mockResolvedValue(emptyPage);

    await getProducts({ categoryId: "cat-1", brandId: "brand-1", frameShape: "AVIATOR", page: 2, limit: 10 });

    const calledPath = mockedApiFetchPage.mock.calls[0][0] as string;
    expect(calledPath.startsWith("/products?")).toBe(true);
    const query = new URLSearchParams(calledPath.split("?")[1]);
    expect(query.get("categoryId")).toBe("cat-1");
    expect(query.get("brandId")).toBe("brand-1");
    expect(query.get("frameShape")).toBe("AVIATOR");
    expect(query.get("page")).toBe("2");
    expect(query.get("limit")).toBe("10");
  });

  it("getProducts serializes search, minPrice and maxPrice into the query string", async () => {
    mockedApiFetchPage.mockResolvedValue(emptyPage);

    await getProducts({ search: "aviator", minPrice: 1_500_000, maxPrice: 2_500_000 });

    const calledPath = mockedApiFetchPage.mock.calls[0][0] as string;
    expect(calledPath.startsWith("/products?")).toBe(true);
    const query = new URLSearchParams(calledPath.split("?")[1]);
    expect(query.get("search")).toBe("aviator");
    expect(query.get("minPrice")).toBe("1500000");
    expect(query.get("maxPrice")).toBe("2500000");
  });

  it("getProducts serializes brandIds (comma-joined), materialType, color, genderTarget and sort", async () => {
    mockedApiFetchPage.mockResolvedValue(emptyPage);

    await getProducts({
      brandIds: ["a", "b"],
      materialType: "METAL",
      color: "Đen",
      genderTarget: "FEMALE",
      sort: "price_asc",
    });

    const calledPath = mockedApiFetchPage.mock.calls[0][0] as string;
    const query = new URLSearchParams(calledPath.split("?")[1]);
    expect(query.get("brandIds")).toBe("a,b");
    expect(query.get("materialType")).toBe("METAL");
    expect(query.get("color")).toBe("Đen");
    expect(query.get("genderTarget")).toBe("FEMALE");
    expect(query.get("sort")).toBe("price_asc");
  });

  it("uploadProductImage appends the image kind to the multipart form", async () => {
    mockedApiFetchData.mockResolvedValue({ id: "img1" });
    const file = new File(["png"], "try-on.png", { type: "image/png" });

    await uploadProductImage("p1", file, "token-1", undefined, "TRY_ON");

    const [path, init] = mockedApiFetchData.mock.calls[0];
    expect(path).toBe("/products/p1/images");
    const form = init.body as FormData;
    expect(form.get("kind")).toBe("TRY_ON");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("getProductById calls /products/:id with the given id", async () => {
    mockedApiFetchData.mockResolvedValue({ id: "abc" });

    await getProductById("abc");

    expect(mockedApiFetchData).toHaveBeenCalledWith("/products/abc");
  });

  it("getCategories calls /categories with the page/limit query", async () => {
    mockedApiFetchPage.mockResolvedValue(emptyPage);

    await getCategories({ limit: 100 });

    expect(mockedApiFetchPage).toHaveBeenCalledWith("/categories?limit=100");
  });
});
