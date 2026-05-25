"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisconnectButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDisconnect = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في إنهاء هذه الجلسة؟")) return;
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
      alert("فصل الجلسة فشل.");
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
      {loading ? "جاري الإنهاء..." : "إنهاء الجلسة"}
    </button>
  );
}
