"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { MultiSmartSelect } from "@/components/ui/MultiSmartSelect";
import type { MultiSmartSelectOption } from "@/components/ui/MultiSmartSelect";

type Presenter = { id: string; name: string | null; username: string };

export function AdminRecordingsPresenterFilter({
  allPresenters,
  initialSelectedIds,
  pageSize,
}: {
  allPresenters:      Presenter[];
  initialSelectedIds: string[];
  pageSize:           number;
}) {
  const router          = useRouter();
  const searchParamsUrl = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  // Sync from URL when navigating externally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedIds(initialSelectedIds); }, [initialSelectedIds.join(",")]);

  const applyFilter = (ids: string[]) => {
    const params = new URLSearchParams(searchParamsUrl.toString());
    ids.length > 0 ? params.set("presenterIds", ids.join(",")) : params.delete("presenterIds");
    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    params.delete("page");
    router.push(`/admin/recordings?${params.toString()}`, { scroll: false });
  };

  const options: MultiSmartSelectOption[] = allPresenters.map(p => ({
    value: p.id,
    label: p.name ? `${p.name} (@${p.username})` : `@${p.username}`,
  }));

  return (
    <MultiSmartSelect
      options={options}
      values={selectedIds}
      onChange={(ids) => {
        setSelectedIds(ids);
        applyFilter(ids);
      }}
      placeholder="المذيعون"
    />
  );
}
