import { apiFetch } from "./client";
import { login, register } from "./auth";

jest.mock("./client", () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe("auth api client", () => {
  afterEach(() => {
    mockedApiFetch.mockReset();
  });

  it("login posts identifier/password to /auth/login", async () => {
    mockedApiFetch.mockResolvedValue({ data: { accessToken: "t" } });

    await login({ identifier: "jane@example.com", password: "hunter22" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "jane@example.com", password: "hunter22" }),
    });
  });

  it("register posts the payload to /auth/register", async () => {
    mockedApiFetch.mockResolvedValue({ data: {} });

    await register({ username: "jane", email: "jane@example.com", password: "hunter22" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "jane", email: "jane@example.com", password: "hunter22" }),
    });
  });
});
