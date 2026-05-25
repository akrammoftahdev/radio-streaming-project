"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { SearchFilter }       from "@/components/ui/SearchFilter";
import { SegmentedFilter }    from "@/components/ui/SegmentedFilter";
import { ClearFiltersButton } from "@/components/ui/ClearFiltersButton";

type Props = {
  initialQ: string; initialStatus: string; initialHasDjCredential: string;
  initialHasPresenters: string; initialHasPrograms: string;
  initialHasManager: string;
  initialSort: string; pageSize: number;
};

export function AdminStationsFilter(p: Props) {
  const router = useRouter();

  const [q,               setQ]               = useState(p.initialQ);
  const [status,          setStatus]          = useState(p.initialStatus          || "all");
  const [hasDjCredential, setHasDjCredential] = useState(p.initialHasDjCredential || "all");
  const [hasPresenters,   setHasPresenters]   = useState(p.initialHasPresenters   || "all");
  const [hasPrograms,     setHasPrograms]     = useState(p.initialHasPrograms     || "all");
  const [hasManager,      setHasManager]      = useState(p.initialHasManager      || "all");
  const [sort,            setSort]            = useState(p.initialSort            || "newest");

  // Sync from URL when navigating externally
  useEffect(() => { setQ(p.initialQ); },                                              [p.initialQ]);
  useEffect(() => { setStatus(p.initialStatus           || "all"); },                 [p.initialStatus]);
  useEffect(() => { setHasDjCredential(p.initialHasDjCredential || "all"); },        [p.initialHasDjCredential]);
  useEffect(() => { setHasPresenters(p.initialHasPresenters     || "all"); },        [p.initialHasPresenters]);
  useEffect(() => { setHasPrograms(p.initialHasPrograms         || "all"); },        [p.initialHasPrograms]);
  useEffect(() => { setHasManager(p.initialHasManager           || "all"); },        [p.initialHasManager]);
  useEffect(() => { setSort(p.initialSort                       || "newest"); },     [p.initialSort]);

  // Debounced search — 400ms
  useEffect(() => {
    const t = setTimeout(() => { if (q !== p.initialQ) apply({ newQ: q }); }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  type Ov = {
    newQ?: string; newStatus?: string; newHasDjCredential?: string;
    newHasPresenters?: string; newHasPrograms?: string; newHasManager?: string; newSort?: string;
  };

  const apply = (ov: Ov) => {
    const params = new URLSearchParams();
    const fQ = ov.newQ !== undefined ? ov.newQ : q;
    if (fQ.trim()) params.set("q", fQ.trim());
    const fStatus = ov.newStatus !== undefined ? ov.newStatus : status;
    if (fStatus !== "all") params.set("status", fStatus);
    const fDj = ov.newHasDjCredential !== undefined ? ov.newHasDjCredential : hasDjCredential;
    if (fDj !== "all") params.set("hasDjCredential", fDj);
    const fPres = ov.newHasPresenters !== undefined ? ov.newHasPresenters : hasPresenters;
    if (fPres !== "all") params.set("hasPresenters", fPres);
    const fProg = ov.newHasPrograms !== undefined ? ov.newHasPrograms : hasPrograms;
    if (fProg !== "all") params.set("hasPrograms", fProg);
    const fMgr = ov.newHasManager !== undefined ? ov.newHasManager : hasManager;
    if (fMgr !== "all") params.set("hasManager", fMgr);
    const fSort = ov.newSort !== undefined ? ov.newSort : sort;
    if (fSort !== "newest") params.set("sort", fSort);
    if (p.pageSize !== 20) params.set("pageSize", p.pageSize.toString());
    router.push(`/admin/stations?${params.toString()}`);
  };

  const clearAll = () => {
    setQ(""); setStatus("all"); setHasDjCredential("all"); setHasPresenters("all");
    setHasPrograms("all"); setHasManager("all"); setSort("newest");
    const params = new URLSearchParams();
    if (p.pageSize !== 20) params.set("pageSize", p.pageSize.toString());
    router.push(`/admin/stations?${params.toString()}`);
  };

  const hasActive = !!(
    q || status !== "all" || hasDjCredential !== "all" ||
    hasPresenters !== "all" || hasPrograms !== "all" ||
    hasManager !== "all" || sort !== "newest"
  );

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col gap-5">

        {/* Search */}
        <SearchFilter
          value={q}
          onChange={setQ}
          placeholder="ابحث باسم المحطة، Slug، أو الوصف..."
        />

        {/* Row 1: Status · DJ Credential · Sort */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">الحالة</label>
            <SegmentedFilter
              value={status}
              options={[
                { value: "all",      label: "الكل"        },
                { value: "active",   label: "نشطة"        },
                { value: "inactive", label: "غير نشطة"    },
              ]}
              onChange={(v) => { setStatus(v); apply({ newStatus: v }); }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">بيانات DJ الافتراضية</label>
            <SegmentedFilter
              value={hasDjCredential}
              options={[
                { value: "all",     label: "الكل"       },
                { value: "has",     label: "مُعدّة"     },
                { value: "missing", label: "غير مُعدّة" },
              ]}
              onChange={(v) => { setHasDjCredential(v); apply({ newHasDjCredential: v }); }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">ترتيب</label>
            <SegmentedFilter
              value={sort}
              options={[
                { value: "newest", label: "الأحدث"  },
                { value: "oldest", label: "الأقدم"  },
                { value: "name",   label: "الاسم أ-ي" },
              ]}
              onChange={(v) => { setSort(v); apply({ newSort: v }); }}
            />
          </div>

        </div>

        {/* Row 2: Has presenters · Has programs · Has manager */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">المذيعون</label>
            <SegmentedFilter
              value={hasPresenters}
              options={[
                { value: "all",  label: "الكل"         },
                { value: "has",  label: "لديها مذيعون" },
                { value: "none", label: "لا يوجد"      },
              ]}
              onChange={(v) => { setHasPresenters(v); apply({ newHasPresenters: v }); }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">البرامج</label>
            <SegmentedFilter
              value={hasPrograms}
              options={[
                { value: "all",  label: "الكل"        },
                { value: "has",  label: "لديها برامج" },
                { value: "none", label: "لا يوجد"     },
              ]}
              onChange={(v) => { setHasPrograms(v); apply({ newHasPrograms: v }); }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">مدير المحطة</label>
            <SegmentedFilter
              value={hasManager}
              options={[
                { value: "all",  label: "الكل"       },
                { value: "has",  label: "لديها مدير" },
                { value: "none", label: "لا يوجد"    },
              ]}
              onChange={(v) => { setHasManager(v); apply({ newHasManager: v }); }}
            />
          </div>

        </div>

      </div>

      {hasActive && (
        <div className="flex justify-start mt-5 pt-4 border-t border-neutral-800">
          <ClearFiltersButton onClick={clearAll} label="مسح كل الفلاتر" />
        </div>
      )}
    </div>
  );
}
