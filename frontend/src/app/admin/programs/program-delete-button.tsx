"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProgramActionResult } from "./actions";

type Props = {
  programId:  string;
  isActive:   boolean;
  deleteAction: (
    _: ProgramActionResult | null,
    fd: FormData
  ) => Promise<ProgramActionResult>;
};

export function ProgramDeleteButton({ programId, isActive, deleteAction }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status,  setStatus]       = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]    = useState("");

  function handleClick() {
    if (!window.confirm(
      "هل أنت متأكد؟ سيتم حذف البرنامج نهائياً. التسجيلات السابقة لن تُحذف لكنها ستُفصل عن البرنامج."
    )) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("programId", programId);
      const result = await deleteAction(null, fd);
      if (result.ok) {
        setStatus("success");
        setTimeout(() => router.refresh(), 600);
      } else {
        setStatus("error");
        setErrorMsg(result.error);
      }
    });
  }

  if (status === "success") {
    return <span className="text-xs text-emerald-400 font-medium">✅ تم الحذف</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isActive || pending}
        title={isActive ? "عطّل البرنامج أولاً ثم احذفه" : "حذف البرنامج نهائياً"}
        className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs font-medium border border-red-800/30 hover:border-red-700/40 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {pending ? (
          <>
            <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            جارٍ الحذف...
          </>
        ) : "🗑 حذف نهائي"}
      </button>
      {status === "error" && (
        <span className="text-[11px] text-red-400">⚠ {errorMsg}</span>
      )}
    </div>
  );
}
