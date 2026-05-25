"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StationActionResult } from "./actions";

type Props = {
  stationId:    string;
  confirmText:  string;
  buttonLabel:  string;
  disabled?:    boolean;
  variant?:     "danger" | "warning" | "info";
  action: (
    _: StationActionResult | null,
    fd: FormData
  ) => Promise<StationActionResult>;
};

export function StationCleanupButton({
  stationId,
  confirmText,
  buttonLabel,
  disabled,
  variant = "danger",
  action,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status,  setStatus]       = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]    = useState("");

  function handleClick() {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("stationId", stationId);
      const result = await action(null, fd);
      if (result.ok) {
        setStatus("success");
        setTimeout(() => router.refresh(), 800);
      } else {
        setStatus("error");
        setErrorMsg(result.error);
      }
    });
  }

  if (status === "success") {
    return <span className="text-xs text-emerald-400 font-medium">✅ تم بنجاح</span>;
  }

  const colorMap = {
    danger:  "bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 border-red-800/30 hover:border-red-700/40",
    warning: "bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 hover:text-amber-300 border-amber-800/30 hover:border-amber-700/40",
    info:    "bg-neutral-800/60 hover:bg-neutral-700/60 text-neutral-300 hover:text-neutral-100 border-neutral-700/50 hover:border-neutral-600/60",
  };

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${colorMap[variant]}`}
      >
        {pending ? (
          <>
            <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            جارٍ التنظيف...
          </>
        ) : buttonLabel}
      </button>
      {status === "error" && (
        <span className="text-[11px] text-red-400">⚠️ {errorMsg}</span>
      )}
    </div>
  );
}
