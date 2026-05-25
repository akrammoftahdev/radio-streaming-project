"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Silently refreshes the server page every {@link intervalMs} ms. */
export default function AutoRefresh({ intervalMs = 5_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null; // renders nothing
}
