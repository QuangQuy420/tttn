import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { LoginForm } from "./LoginForm";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  login: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedLogin = login as jest.Mock;

describe("LoginForm", () => {
  const push = jest.fn();
  const refresh = jest.fn();

  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push, refresh });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows validation errors instead of submitting when fields are invalid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email hoặc tên đăng nhập/i), " ");
    await user.type(screen.getByLabelText(/mật khẩu/i), "short");
    await user.click(screen.getByRole("button", { name: /đăng nhập/i }));

    expect(screen.getByText(/bắt buộc/i)).toBeInTheDocument();
    expect(screen.getByText(/ít nhất 8 ký tự/i)).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("submits valid credentials and redirects on success", async () => {
    mockedLogin.mockResolvedValue({ data: { accessToken: "t" } });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email hoặc tên đăng nhập/i), "jane@example.com");
    await user.type(screen.getByLabelText(/mật khẩu/i), "hunter22");
    await user.click(screen.getByRole("button", { name: /đăng nhập/i }));

    expect(mockedLogin).toHaveBeenCalledWith({ identifier: "jane@example.com", password: "hunter22" });
    await screen.findByRole("button", { name: /đăng nhập/i });
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the error message when the auth call rejects", async () => {
    mockedLogin.mockRejectedValue(new (jest.requireActual("@/lib/api/client").ApiError)("Invalid credentials", 401));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email hoặc tên đăng nhập/i), "jane@example.com");
    await user.type(screen.getByLabelText(/mật khẩu/i), "hunter22");
    await user.click(screen.getByRole("button", { name: /đăng nhập/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(push).not.toHaveBeenCalled();
  });
});
