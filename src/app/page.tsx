"use client";

import { useEffect, useState } from "react";
import Login from "@/components/auth/login";
import Dashboard from "@/components/dashboard/dashboard";
import { useGlobalStore } from "@/stores/global_stores";
import { basePath } from "@/lib/config";


export default function Home() {
  const { setAuth ,auth } = useGlobalStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${basePath}/api/auth/check-auth`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAuth(data.user);
        }
      } finally {
        setChecking(false);
      }
    };
    checkAuth();
  }, [setAuth]);

  if (checking) return null; // or a loading spinner

  return auth ? <Dashboard /> : <Login />;

}
