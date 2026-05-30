"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { SegmentedFilter } from "@/components/ui/SegmentedFilter";
import { useTranslations } from 'next-intl';

export function AdminRecordingsTypeSortFilter({
  initialPresenterMode,
  initialFileType,
  initialSort,
  pageSize,
}: {
  initialPresenterMode: string;
  initialFileType:      string;
  initialSort:          string;
  pageSize:             number;
}) {
  const router          = useRouter();
  const searchParamsUrl = useSearchParams();
  const t = useTranslations('admin.recordings');

  const [presenterMode, setPresenterMode] = useState(initialPresenterMode || "all");
  const [fileType,      setFileType]      = useState(initialFileType      || "all");
  const [sort,          setSort]          = useState(initialSort          || "newest");

  useEffect(() => { setPresenterMode(initialPresenterMode || "all"); }, [initialPresenterMode]);
  useEffect(() => { setFileType(initialFileType           || "all"); }, [initialFileType]);
  useEffect(() => { setSort(initialSort                   || "newest"); }, [initialSort]);

  const apply = (overrides: { newPresenterMode?: string; newFileType?: string; newSort?: string }) => {
    const params = new URLSearchParams(searchParamsUrl.toString());

    const finalPresenterMode = overrides.newPresenterMode !== undefined ? overrides.newPresenterMode : presenterMode;
    if (finalPresenterMode && finalPresenterMode !== "all") params.set("presenterMode", finalPresenterMode);
    else params.delete("presenterMode");

    const finalFileType = overrides.newFileType !== undefined ? overrides.newFileType : fileType;
    if (finalFileType && finalFileType !== "all") params.set("fileType", finalFileType);
    else params.delete("fileType");

    const finalSort = overrides.newSort !== undefined ? overrides.newSort : sort;
    if (finalSort && finalSort !== "newest") params.set("sort", finalSort);
    else params.delete("sort");

    if (pageSize !== 20) params.set("pageSize", pageSize.toString());
    params.delete("page");
    // Remove legacy recMode param if present
    params.delete("recMode");
    router.push(`/admin/recordings?${params.toString()}`);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Presenter type — fixed-value, mutually exclusive */}
        <div className="flex flex-col">
          <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">{t('presenterType')}</label>
          <SegmentedFilter
            value={presenterMode}
            options={[
              { value: "all",            label: t('all')           },
              { value: "SINGLE_STATION", label: t('singleStation')     },
              { value: "MULTI_STATION",  label: t('multiStation') },
              { value: "DIRECT_DJ",      label: t('directDj')       },
            ]}
            onChange={(v) => { setPresenterMode(v); apply({ newPresenterMode: v }); }}
          />
        </div>

        {/* File type — fixed-value, mutually exclusive */}
        <div className="flex flex-col">
          <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">{t('fileType')}</label>
          <SegmentedFilter
            value={fileType}
            options={[
              { value: "all",        label: t('all') },
              { value: "audio/mpeg", label: "MP3"  },
              { value: "audio/webm", label: "WebM" },
            ]}
            onChange={(v) => { setFileType(v); apply({ newFileType: v }); }}
          />
        </div>

        {/* Sort — mutually exclusive */}
        <div className="flex flex-col">
          <label className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">{t('sortLabel')}</label>
          <SegmentedFilter
            value={sort}
            options={[
              { value: "newest",        label: t('newest') },
              { value: "oldest",        label: t('oldest') },
              { value: "duration-high", label: t('durationHigh') },
              { value: "duration-low",  label: t('durationLow') },
              { value: "size-high",     label: t('sizeHigh') },
              { value: "size-low",      label: t('sizeLow') },
            ]}
            onChange={(v) => { setSort(v); apply({ newSort: v }); }}
          />
        </div>

      </div>
    </div>
  );
}
