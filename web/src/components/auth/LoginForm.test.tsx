import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { login } from "@/lib/api";
import { LoginForm } from "./LoginForm";

jest.mock("@/lib/api", () => ({
  login: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedLogin = login as jest.Mock;

describe("LoginForm", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows validation errors instead of submitting when fields are invalid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "short");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("submits valid credentials to the (stubbed) auth client and shows success", async () => {
    mockedLogin.mockResolvedValue({ token: "t", user: { id: "1", email: "jane@example.com", name: "jane" } });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(mockedLogin).toHaveBeenCalledWith({ email: "jane@example.com", password: "hunter22" });
    expect(await screen.findByText(/logged in successfully/i)).toBeInTheDocument();
  });

  it("shows the error message when the auth call rejects", async () => {
    mockedLogin.mockRejectedValue(new (jest.requireActual("@/lib/api/client").ApiError)("Invalid credentials", 401));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
  });
});
