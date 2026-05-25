"use client";
import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/providers/PlayerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <PlayerProvider>
        {children}
      </PlayerProvider>
    </SessionProvider>
  );
}
