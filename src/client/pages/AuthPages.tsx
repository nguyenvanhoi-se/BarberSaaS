import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AuthForm({ mode, redirectTo }: { mode: "login" | "register"; redirectTo?: string }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register") await register({ name: String(form.get("name")), email: String(form.get("email")), phone: String(form.get("phone") ?? ""), password: String(form.get("password")) });
      else await login({ email: String(form.get("email")), password: String(form.get("password")) });
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(redirectTo || from || "/profile", { replace: true });
    } catch { setError("Unable to authenticate with those details."); }
    finally { setSubmitting(false); }
  }
  return <main className="site-container max-w-2xl py-14 sm:py-20"><form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-2xl border border-white/10 bg-white/[.035] p-7 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[.25em] text-[var(--accent-color)]">{mode === "login" ? "Welcome back" : "Join the shop"}</p>
    <h1 className="font-display text-3xl text-white">{mode === "login" ? "Sign in" : "Create a customer account"}</h1>
    {mode === "register" && <><label className="block text-sm text-neutral-300">Name<input name="name" required maxLength={120} autoComplete="name" className="form-input mt-2" /></label><label className="block text-sm text-neutral-300">Phone<input name="phone" maxLength={32} autoComplete="tel" className="form-input mt-2" /></label></>}
    <label className="block text-sm text-neutral-300">Email<input name="email" type="email" required autoComplete="email" className="form-input mt-2" /></label>
    <label className="block text-sm text-neutral-300">Password<input name="password" type="password" minLength={mode === "register" ? 12 : 1} required autoComplete={mode === "login" ? "current-password" : "new-password"} className="form-input mt-2" /></label>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}<button disabled={submitting} className="button button-primary w-full">{submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}</button>
    {redirectTo ? <Link to="/super-admin/login" className="block text-sm text-indigo-300">Platform administrator sign in</Link> : <Link to={mode === "login" ? "/register" : "/login"} className="block text-sm text-[var(--accent-color)]">{mode === "login" ? "Create an account" : "Already registered? Sign in"}</Link>}
  </form></main>;
}
