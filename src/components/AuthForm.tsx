"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "login" | "register";

function formatError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fieldErrors = (error as { fieldErrors: Record<string, string[] | undefined> }).fieldErrors;
    const messages = Object.values(fieldErrors).flat().filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  return "Something went wrong. Please try again.";
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(formatError(payload.error));
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-8">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-widest text-sky-600">DiseaseDetect</p>
        <h1 className="text-3xl font-bold">{isRegister ? "Create an account" : "Sign in"}</h1>
      </header>

      <section className="card">
        <form className="space-y-4" onSubmit={onSubmit}>
          {isRegister && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional"
                autoComplete="name"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button type="submit" className="primary w-full px-4 py-2" disabled={loading}>
            {loading ? "Please wait..." : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
      </section>

      <p className="text-center text-sm text-slate-600">
        {isRegister ? "Already have an account? " : "New to DiseaseDetect? "}
        <Link href={isRegister ? "/login" : "/register"} className="font-medium text-sky-600 hover:underline">
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </main>
  );
}
