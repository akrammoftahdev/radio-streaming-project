"use client";

import { useTranslations } from "next-intl";

/**
 * DeleteManagerButton — "use client" only for the confirm dialog.
 * The parent <form action={deleteStationManager}> lives in the server
 * component (page.tsx). This button is just the submit trigger + confirm gate.
 */
export function DeactivateManagerButton() {
  const t = useTranslations("admin.stationManagers");
  return (
    <button
      type="submit"
      className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
      onClick={(e) => {
        const ok = window.confirm(t("deleteConfirm"));
        if (!ok) e.preventDefault();
      }}
    >
      {t("deleteManager")}
    </button>
  );
}
