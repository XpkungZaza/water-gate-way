"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { loginUrl } from "@/lib/loginUrl";

/** Navigate to /login, keeping where the user was (replace: the expired page must not stay in history). */
export function useRedirectToLogin(): () => void {
  const router = useRouter();
  return useCallback(() => {
    router.replace(loginUrl(window.location.pathname, window.location.search));
  }, [router]);
}
