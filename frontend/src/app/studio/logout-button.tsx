"use client";

import { logoutAction } from "./logout-action";
import { useTranslations } from "next-intl";

export default function LogoutButton() {
  const t = useTranslations("auth");

  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 bg-neutral-900 hover:bg-red-500/10 border border-neutral-800 hover:border-red-500/30 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        {t("logout")}
      </button>
    </form>
  );
}
