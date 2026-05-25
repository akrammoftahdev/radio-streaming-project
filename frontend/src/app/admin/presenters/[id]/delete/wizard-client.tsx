"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PresenterActionResult } from "./actions";

type Props = {
  presenterId:      string;
  isActive:         boolean;
  isHardDeleteSafe: boolean;
  deactivateAction: (_: PresenterActionResult | null, fd: FormData) => Promise<PresenterActionResult>;
  hardDeleteAction: (_: PresenterActionResult | null, fd: FormData) => Promise<PresenterActionResult>;
};

export function PresenterWizardClient({
  presenterId,
  isActive,
  isHardDeleteSafe,
  deactivateAction,
  hardDeleteAction,
}: Props) {
  const router = useRouter();

  // Deactivate state
  const [deactivating, startDeactivate] = useTransition();
  const [deactivateStatus, setDeactivateStatus] = useState<"idle" | "success" | "error">("idle");
  const [deactivateError, setDeactivateError]   = useState("");

  // Hard delete state
  const [deleting, startDelete] = useTransition();
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "error">("idle");
  const [deleteError, setDeleteError]   = useState("");

  function handleDeactivate() {
    if (
      !window.confirm(
        "سيتم تعطيل حساب المذيع. يمكن إعادة تفعيله لاحقاً من صفحة التعديل."
      )
    ) return;

    startDeactivate(async () => {
      const fd = new FormData();
      fd.set("presenterId", presenterId);
      const result = await deactivateAction(null, fd);
      if (result.ok) {
        setDeactivateStatus("success");
        setTimeout(() => router.refresh(), 1000);
      } else {
        setDeactivateStatus("error");
        setDeactivateError(result.error);
      }
    });
  }

  function handleHardDelete() {
    if (
      !window.confirm(
        "سيتم حذف حساب المذيع نهائياً. لا يمكن التراجع عن هذا الإجراء."
      )
    ) return;

    startDelete(async () => {
      const fd = new FormData();
      fd.set("presenterId", presenterId);
      const result = await hardDeleteAction(null, fd);
      // If ok: action redirects to /admin/presenters — no client handling needed
      if (!result.ok) {
        setDeleteStatus("error");
        setDeleteError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Deactivate zone ── */}
      <div className="bg-amber-950/20 border border-amber-800/30 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-amber-400 mb-1">تعطيل المذيع</h2>
        <p className="text-xs text-neutral-400 mb-4">
          يوقف البث ويخفي الحساب. يمكن التراجع عنه لاحقاً. البيانات والتسجيلات محفوظة.
        </p>

        {deactivateStatus === "success" ? (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-700/30 rounded-lg">
            ✅ تم تعطيل المذيع بنجاح
          </span>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={deactivating || !isActive}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-900/50 hover:bg-amber-800/60 text-amber-300 hover:text-amber-200 text-sm font-medium border border-amber-700/40 hover:border-amber-600/50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-fit"
            >
              {deactivating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  جارٍ التعطيل...
                </>
              ) : (
                <>{isActive ? "تعطيل المذيع" : "المذيع معطّل بالفعل"}</>
              )}
            </button>
            {deactivateStatus === "error" && (
              <span className="text-xs text-red-400">⚠️ {deactivateError}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Hard delete danger zone ── */}
      <div className="bg-red-950/20 border border-red-800/40 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-red-400 mb-1">⚠ حذف نهائي</h2>
        <p className="text-xs text-neutral-400 mb-4">
          يحذف الحساب والبيانات المرتبطة به نهائياً. هذا الإجراء لا يمكن التراجع عنه.
        </p>

        {isHardDeleteSafe ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleHardDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-900/60 hover:bg-red-800/70 text-red-300 hover:text-red-200 text-sm font-medium border border-red-700/50 hover:border-red-600/60 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-fit"
            >
              {deleting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  جارٍ الحذف...
                </>
              ) : (
                "حذف المذيع نهائياً"
              )}
            </button>
            {deleteStatus === "error" && (
              <span className="text-xs text-red-400">⚠️ {deleteError}</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-800/40 text-neutral-600 text-sm font-medium border border-neutral-700/30 rounded-xl cursor-not-allowed w-fit"
          >
            🔒 الحذف النهائي غير متاح
          </button>
        )}
      </div>
    </div>
  );
}
