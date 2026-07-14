import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import { RegisterForm } from "./RegisterForm";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  register: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedRegister = register as jest.Mock;

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^tên đăng nhập$/i), "jane");
  await user.type(screen.getByLabelText(/^họ và tên$/i), "Jane Doe");
  await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
  await user.type(screen.getByLabelText(/^mật khẩu$/i), "hunter22");
  await user.type(screen.getByLabelText(/^xác nhận mật khẩu$/i), "hunter22");
}

describe("RegisterForm", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows a validation error when the password confirmation doesn't match", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/^xác nhận mật khẩu$/i));
    await user.type(screen.getByLabelText(/^xác nhận mật khẩu$/i), "different");
    await user.click(screen.getByRole("button", { name: /đăng ký/i }));

    expect(screen.getByText(/không khớp/i)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("submits valid input to the auth client and shows the success message", async () => {
    mockedRegister.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /đăng ký/i }));

    expect(mockedRegister).toHaveBeenCalledWith({
      username: "jane",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: undefined,
      password: "hunter22",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/đăng ký thành công/i);
  });
});
