import { render, screen } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "./Header";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUsePathname = usePathname as jest.Mock;

describe("Header", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    mockedUsePathname.mockReturnValue("/");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("links the logo to the homepage", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: /smart eyewear/i })).toHaveAttribute("href", "/");
  });

  it("renders real links for Sản phẩm, Phân tích khuôn mặt, and Đăng nhập", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /phân tích khuôn mặt/i })).toHaveAttribute(
      "href",
      "/face-analysis",
    );
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });

  it("links the cart icon to the cart page", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: /giỏ hàng/i })).toHaveAttribute("href", "/cart");
  });
});
