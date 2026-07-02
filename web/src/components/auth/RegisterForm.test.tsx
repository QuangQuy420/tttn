import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { register } from "@/lib/api";
import { RegisterForm } from "./RegisterForm";

jest.mock("@/lib/api", () => ({
  register: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedRegister = register as jest.Mock;

describe("RegisterForm", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows a validation error when the password confirmation doesn't match", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Jane");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter22");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("submits valid input to the (stubbed) auth client and shows success", async () => {
    mockedRegister.mockResolvedValue({
      token: "t",
      user: { id: "1", email: "jane@example.com", name: "Jane" },
    });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Jane");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter22");
    await user.type(screen.getByLabelText(/confirm password/i), "hunter22");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(mockedRegister).toHaveBeenCalledWith({
      name: "Jane",
      email: "jane@example.com",
      password: "hunter22",
    });
    expect(await screen.findByText(/account created successfully/i)).toBeInTheDocument();
  });
});
