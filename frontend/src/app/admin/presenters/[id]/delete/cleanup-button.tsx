"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { PresenterActionResult } from "./actions";

type Props = {
  presenterId:  string;
  confirmText:  string;
  buttonLabel:  string;
  disabled?:    boolean;
  action: (
    _: PresenterActionResult | null,
    fd: FormData
  ) => Promise<PresenterActionResult>;
};

export function CleanupButton({
  presenterId,
  confirmText,
  buttonLabel,
  disabled,
  action,
}: Props) {
  const t = useTranslations("admin.presenters");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus]        = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]    = useState("");

  function handleClick() {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("presenterId", presenterId);
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
    return (
      <span className="text-xs text-emerald-400 font-medium">✅ {t("success")}</span>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs font-medium border border-red-800/30 hover:border-red-700/40 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {pending ? (
          <>
            <svg
              className="w-3 h-3 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            جارٍ التنظيف...
          </>
        ) : (
          buttonLabel
        )}
      </button>
      {status === "error" && (
        <span className="text-[11px] text-red-400">⚠️ {errorMsg}</span>
      )}
    </div>
  );
}
