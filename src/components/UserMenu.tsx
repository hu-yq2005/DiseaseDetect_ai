"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
}

export default function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (!user) return null;

  return (
    <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
      <span>{user.name || user.email}</span>
      <button type="button" onClick={logout} className="bg-white px-3 py-1 hover:bg-slate-100">
        Sign out
      </button>
    </div>
  );
}
