"use client";

import { useEffect, useState } from "react";
import { basePath } from "@/lib/config";
import { useGlobalStore } from "@/stores/global_stores";

import Login from "@/components/auth/login";
import LayoutParent from "@/components/_layout/_layout";

export default function Home() {
  const { setAuth ,auth } = useGlobalStore();
  const [checking, setChecking] = useState(true);

  //Authententicaion check on page load
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
  }, [setAuth]); //setAuth

  if (checking) return null; // or a loading spinner

  return auth ? <LayoutParent /> : <Login />;

}
