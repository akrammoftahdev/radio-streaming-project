"use client";

/**
 * DeleteManagerButton — "use client" only for the confirm dialog.
 * The parent <form action={deleteStationManager}> lives in the server
 * component (page.tsx). This button is just the submit trigger + confirm gate.
 */
export function DeactivateManagerButton() {
  return (
    <button
      type="submit"
      className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
      onClick={(e) => {
        const ok = window.confirm(
          "هل أنت متأكد؟ سيتم حذف حساب مدير المحطة نهائياً وإزالة صلاحياته من المحطات. لن يتم حذف أي محطات أو مذيعين أو برامج أو تسجيلات."
        );
        if (!ok) e.preventDefault();
      }}
    >
      حذف المدير
    </button>
  );
}
