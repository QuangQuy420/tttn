import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <section aria-labelledby="login-heading">
      <h1 id="login-heading">Log in</h1>
      <LoginForm />
    </section>
  );
}
