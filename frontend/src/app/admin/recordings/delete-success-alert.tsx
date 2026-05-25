"use client";

import { useEffect } from "react";

/**
 * DeleteSuccessAlert
 * Runs entirely client-side. Shows window.alert on mount when `show` is true,
 * then cleans the URL param so a refresh doesn't re-trigger the alert.
 */
export function DeleteSuccessAlert({ show }: { show: boolean }) {
  useEffect(() => {
    if (!show) return;
    window.alert("تم حذف التسجيل بنجاح");
    // Clean ?deleted=... from the URL without triggering a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("deleted");
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + (url.search || ""));
  }, [show]);

  return null; // no DOM output
}
