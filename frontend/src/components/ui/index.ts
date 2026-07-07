/**
 * EGONAIR Shared UI Components
 * src/components/ui/index.ts
 *
 * Presentational only — no URL/router/business logic in these components.
 * Pages import directly from their file path during pilot phase.
 * This barrel export is for future convenience.
 */

// ── Status & feedback ─────────────────────────────────────────────────────────
export { StatusBadge }      from "./StatusBadge";
export { EmptyState }       from "./EmptyState";
export { Unauthorized }     from "./Unauthorized";

// ── Actions ───────────────────────────────────────────────────────────────────
export { ActionButton }        from "./ActionButton";
export { ClearFiltersButton }  from "./ClearFiltersButton";

// ── Layout shells ─────────────────────────────────────────────────────────────
export { AdminPageShell } from "./AdminPageShell";
export type { AdminPageShellProps } from "./AdminPageShell";
export { FilterShell }   from "./FilterShell";
export { PaginationBar } from "./PaginationBar";

// ── Filter primitives ─────────────────────────────────────────────────────────
export { SearchFilter }      from "./SearchFilter";
export { SegmentedFilter }   from "./SegmentedFilter";
export { SmartSelect }       from "./SmartSelect";
export { MultiSmartSelect }  from "./MultiSmartSelect";

// ── Re-export option types for consumer convenience ───────────────────────────
export type { SegmentOption }          from "./SegmentedFilter";
export type { SmartSelectOption }      from "./SmartSelect";
export type { MultiSmartSelectOption } from "./MultiSmartSelect";
export { AutoRefresh } from "./AutoRefresh";
