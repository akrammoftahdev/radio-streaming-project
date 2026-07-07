"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DisconnectButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("admin.live");

  const handleDisconnect = async () => {
    if (!confirm(t("disconnectConfirm"))) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/live/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      router.refresh();
    } catch (e) {
      console.error(e);
      alert(t("disconnectFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="mt-2 px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
    >
      {loading ? t("disconnecting") : t("disconnect")}
    </button>
  );
}
