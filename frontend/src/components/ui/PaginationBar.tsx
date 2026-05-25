/**
 * PaginationBar — Presentational pagination component.
 * No data fetching. No router logic inside this component.
 * The parent passes href strings for previous/next links.
 *
 * Props:
 *   page        — current page (1-indexed)
 *   totalPages  — total number of pages
 *   previousHref — href string for the previous page link (or null if first page)
 *   nextHref     — href string for the next page link (or null if last page)
 *   pageSizeNode — optional slot for a page-size selector element
 */

import React from "react";
import Link from "next/link";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  previousHref: string | null;
  nextHref: string | null;
  /** Optional node for a page-size selector */
  pageSizeNode?: React.ReactNode;
  className?: string;
}

export function PaginationBar({
  page,
  totalPages,
  previousHref,
  nextHref,
  pageSizeNode,
  className = "",
}: PaginationBarProps) {
  if (totalPages <= 1 && !pageSizeNode) return null;

  return (
    <div
      className={[
        "flex items-center justify-between gap-4 mt-6 pt-5 border-t",
        className,
      ].join(" ")}
      style={{ borderColor: "var(--eg-border-soft)" }}
    >
      {/* Page size slot */}
      <div className="flex items-center gap-3">
        {pageSizeNode ?? <span />}
      </div>

      {/* Page indicator + prev/next */}
      <div className="flex items-center gap-3">
        {/* Previous */}
        {previousHref ? (
          <Link
            href={previousHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all"
            style={{ background: "var(--eg-surface)", borderColor: "var(--eg-border)", color: "var(--eg-text-muted)" }}
          >
            {/* Arrow right for RTL "previous" */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            التالي
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-not-allowed select-none"
            style={{ background: "var(--eg-surface-soft)", borderColor: "var(--eg-border-soft)", color: "var(--eg-text-faint)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            التالي
          </span>
        )}

        {/* Page indicator */}
        <span className="text-xs tabular-nums" style={{ color: "var(--eg-text-muted)" }}>
          {page} / {totalPages}
        </span>

        {/* Next */}
        {nextHref ? (
          <Link
            href={nextHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all"
            style={{ background: "var(--eg-surface)", borderColor: "var(--eg-border)", color: "var(--eg-text-muted)" }}
          >
            السابق
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-not-allowed select-none"
            style={{ background: "var(--eg-surface-soft)", borderColor: "var(--eg-border-soft)", color: "var(--eg-text-faint)" }}
          >
            السابق
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
