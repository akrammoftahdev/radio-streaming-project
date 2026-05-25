"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRecording } from "./actions";

export function DeleteRecordingButton({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleClick() {
    if (
      !window.confirm(
        "هل أنت متأكد؟ سيتم حذف ملف التسجيل من الأرشيف والديسك. لا يمكن التراجع."
      )
    ) return;

    startTransition(async () => {
      // Build a minimal FormData for the server action
      const fd = new FormData();
      fd.set("recordingId", recordingId);

      const result = await deleteRecording(null, fd);

      if (result?.ok) {
        setStatus("success");
        // Short pause so the user sees "تم الحذف بنجاح", then refresh
        setTimeout(() => router.refresh(), 1000);
      } else {
        setStatus("error");
        setErrorMsg(result?.error ?? "حدث خطأ غير متوقع");
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-700/30 rounded-lg">
        ✅ تم الحذف بنجاح
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-950/50 hover:bg-red-900/60 text-red-400 hover:text-red-300 text-xs font-medium border border-red-800/40 hover:border-red-600/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <svg
              className="w-3.5 h-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            جارٍ الحذف...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            حذف التسجيل
          </>
        )}
      </button>

      {/* Inline error — only shown when action fails */}
      {status === "error" && (
        <span className="text-[11px] text-red-400 mt-0.5">⚠️ {errorMsg}</span>
      )}
    </div>
  );
}
