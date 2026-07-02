import { ApiError } from "./client";
import { login, register } from "./auth";

// user-service's /api/auth/* doesn't exist yet (Q6) — these stubs are pure client-side
// logic, so we test them directly rather than mocking a network call.

describe("auth api stubs", () => {
  it("login resolves with a stub token/user for valid credentials", async () => {
    const result = await login({ email: "jane@example.com", password: "hunter22" });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe("jane@example.com");
  });

  it("login rejects with an ApiError when email or password is missing", async () => {
    await expect(login({ email: "", password: "hunter22" })).rejects.toBeInstanceOf(ApiError);
    await expect(login({ email: "jane@example.com", password: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("register resolves with a stub token/user for valid input", async () => {
    const result = await register({ name: "Jane", email: "jane@example.com", password: "hunter22" });

    expect(result.token).toBeTruthy();
    expect(result.user).toEqual({ id: "stub-user-id", email: "jane@example.com", name: "Jane" });
  });

  it("register rejects with an ApiError when a required field is missing", async () => {
    await expect(
      register({ name: "", email: "jane@example.com", password: "hunter22" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
