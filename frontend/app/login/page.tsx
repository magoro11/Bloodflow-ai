"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

type AuthMode = "login" | "register";

function responseMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("detail" in body)) return fallback;
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item: unknown) =>
      item && typeof item === "object" && "msg" in item && typeof item.msg === "string"
        ? [item.msg]
        : [],
    );
    if (messages.length) return messages.join(". ");
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("manager@bloodflow.demo");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(body, mode === "register"
          ? "Unable to create your account. Please check your details and try again."
          : "Unable to sign in. Check your email and password."));
      }

      if (mode === "register") {
        const registeredEmail = body && typeof body === "object" && "email" in body && typeof body.email === "string"
          ? body.email
          : email;
        setEmail(registeredEmail);
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        setNotice("Account created. Sign in to continue. Self-registered accounts have read-only analyst access.");
        return;
      }

      if (!body || typeof body !== "object" || !("access_token" in body) ||
        typeof body.access_token !== "string" || !("user" in body)) {
        throw new Error("The sign-in response was invalid. Please try again.");
      }
      window.localStorage.setItem("bloodflow_token", body.access_token);
      window.localStorage.setItem("bloodflow_user", JSON.stringify(body.user));
      router.push("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function useDemoAccount() {
    setEmail("manager@bloodflow.demo");
    setPassword("DemoManager!2026");
    setError("");
    setNotice("");
  }

  function toggleMode() {
    const nextMode = mode === "login" ? "register" : "login";
    setMode(nextMode);
    if (email === "manager@bloodflow.demo") setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
  }

  return (
    <main className="login-screen">
      <div className="login-layout">
        <section className="login-story" aria-label="About BloodFlow AI">
          <Link className="brand login-brand" href="/">
            <span className="brand-mark">+</span>
            <span>BloodFlow <span className="brand-accent">AI</span></span>
          </Link>
          <div className="login-story-content">
            <div className="login-kicker"><span className="status-dot" /> NETWORK SUPPLY INTELLIGENCE</div>
            <h1>See the shortage.<br /><span>Move with confidence.</span></h1>
            <p>One clear view of blood inventory, demand signals, and human-reviewed transfer recommendations across your network.</p>
            <div className="login-features">
              <div><span className="feature-mark">01</span><span><strong>Forecast demand</strong><small>Spot emerging pressure before stock runs low.</small></span></div>
              <div><span className="feature-mark">02</span><span><strong>Protect eligible stock</strong><small>Exclude expired, reserved, and quarantined units.</small></span></div>
              <div><span className="feature-mark">03</span><span><strong>Coordinate safely</strong><small>Keep an authorized person in control of every transfer.</small></span></div>
            </div>
          </div>
          <div className="login-story-footer">DECISION SUPPORT ONLY <span>·</span> SIMULATED DEMO NETWORK</div>
        </section>

        <section className="login-panel">
          <form className="login-card" onSubmit={submit} aria-busy={busy}>
            <div className="login-card-top">
              <div className="login-card-icon">↗</div>
              <span className="badge"><span className="status-dot" /> DEMO ENVIRONMENT</span>
            </div>
            <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="login-intro">
              {mode === "login"
                ? "Sign in to your network workspace."
                : "Register for read-only access to the simulated network."}
            </p>

            <label className="field">
              Work email
              <input
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@organization.org"
              />
            </label>

            <label className="field">
              Password
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  maxLength={128}
                  minLength={mode === "register" ? 12 : 1}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {mode === "register" && (
              <>
                <label className="field">
                  Confirm password
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={128}
                    minLength={12}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter your password"
                  />
                </label>
                <p className="login-hint">Use 12–128 characters. Operational roles must be assigned by an administrator.</p>
              </>
            )}

            {error && <p className="login-error" role="alert">{error}</p>}
            {notice && <p className="login-notice" role="status">{notice}</p>}

            <button className="button primary login-submit" disabled={busy} type="submit">
              {busy
                ? <><span className="button-spinner" /> {mode === "login" ? "Signing in..." : "Creating account..."}</>
                : <>{mode === "login" ? "Sign in" : "Create account"} <span aria-hidden="true">→</span></>}
            </button>

            {mode === "login" && (
              <>
                <div className="login-divider"><span>OR</span></div>
                <button className="demo-login" onClick={useDemoAccount} type="button">
                  <span className="demo-avatar">BM</span>
                  <span><strong>Use the demo manager account</strong><small>Pre-fill local demo credentials</small></span>
                  <span aria-hidden="true" className="demo-arrow">→</span>
                </button>
                <p className="login-demo-note">Demo password: <code>DemoManager!2026</code></p>
              </>
            )}
            <p className="login-safety">All facilities and inventory shown in this demo are simulated. This tool does not make clinical or compatibility decisions.</p>
          </form>
          <div className="login-panel-footer">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button className="auth-mode-toggle" disabled={busy} onClick={toggleMode} type="button">
              {mode === "login" ? "Create a read-only account" : "Sign in"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
