"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import LogoutButton from "./logout-button";
import { RecordingCompactList } from "@/components/recordings/RecordingPlayer";

interface Recording {
  id: string;
  localPath: string;
  startedAt: Date | string;
  durationSeconds: number | null;
}

interface WaitScreenProps {
  gateOpenTimeMs:            number;
  sessionStartMs:            number;
  sessionEndMs:              number;
  nextBroadcastTime:         string;   // formatted session start (from server)
  sessionEndTime:            string;   // formatted session end (from server)
  allowConnectMinutesBefore: number;
  programTitle?:             string;
  stationName?:              string;
  latestRecordings?:         Recording[];
}

function formatDuration(sec: number | null): string {
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatRecordingDate(d: Date | string): string {
  const date = new Date(d);
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date);
}

import { useRouter } from "next/navigation";

export default function WaitScreen({
  gateOpenTimeMs,
  sessionStartMs,
  sessionEndMs,
  nextBroadcastTime,
  sessionEndTime,
  allowConnectMinutesBefore,
  programTitle,
  stationName,
  latestRecordings = [],
}: WaitScreenProps) {
  // mounted guard — Date.now() must NOT run during SSR useState init because
  // the server and client execute at different instants, producing different
  // timeLeftMs values → different HH:MM:SS digits → hydration mismatch.
  const [mounted, setMounted]        = useState(false);
  // Deterministic initial state: server and client first render are identical.
  const [timeLeftMs, setTimeLeftMs]  = useState<number>(0);
  const [gateOpen, setGateOpen]      = useState<boolean>(false);
  const [isSyncing, setIsSyncing]    = useState<boolean>(false);
  const router = useRouter();

  const handleEnter = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsSyncing(true);
    router.refresh();
    setTimeout(() => setIsSyncing(false), 3000); // clear if server still returns WaitScreen
  };

  // ── Countdown ticker ──────────────────────────────────────────────────────
  const reloadFiredRef = React.useRef(false); // guard: only reload once
  useEffect(() => {
    setMounted(true);
    const tick = () => {
      const remaining = gateOpenTimeMs - Date.now();
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        setGateOpen(true);
        clearInterval(id);
        // Auto-transition: soft refresh once so server renders PreFlightScreen
        if (!reloadFiredRef.current) {
          reloadFiredRef.current = true;
          setTimeout(() => { handleEnter(); }, 800);
        }
      }
    };
    tick(); // run immediately on mount to populate real values
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gateOpenTimeMs]);

  // ── HH:MM:SS parts ───────────────────────────────────────────────────────
  const totalSec = Math.max(0, Math.floor(timeLeftMs / 1000));
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");


  return (
    <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans relative overflow-hidden flex flex-col">

      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[min(700px,100vw)] h-[min(700px,100vw)] bg-indigo-500/5 rounded-full blur-[120px]" />
      </div>

      {/* top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-5 pb-2">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
          في انتظار موعد البث
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-indigo-300 border border-neutral-800 hover:border-indigo-500/40 rounded-lg px-3 py-2 transition-colors bg-neutral-900/80"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            ملفي
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* main two-column layout on ≥md, single column on mobile */}
      <div className="relative z-10 flex-1 flex flex-col md:flex-row gap-6 px-4 md:px-8 pb-8 pt-4 max-w-5xl mx-auto w-full">

        {/* ── LEFT COLUMN: Countdown + session info ── */}
        <div className="flex flex-col gap-5 md:w-[420px] flex-shrink-0">

          {/* Countdown card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500" />

            {/* icon */}
            <div className="w-14 h-14 bg-neutral-800/80 border border-neutral-700 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>

            <p className="text-neutral-500 text-sm font-medium mb-3">
              {mounted && gateOpen ? "حان موعد الدخول" : "الوقت المتبقي لدخول الاستوديو"}
            </p>

            {/* Big digital clock */}
            {mounted && gateOpen ? (
              <p className="text-4xl font-black tracking-widest text-emerald-400 mb-2">يمكنك الدخول الآن</p>
            ) : (
              <div className="flex items-center justify-center gap-1 mb-2" dir="ltr">
                <div className="bg-neutral-950 rounded-2xl px-4 py-3 min-w-[72px]">
                  <span className="block text-5xl font-black tabular-nums text-indigo-300">{mounted ? hh : "--"}</span>
                  <span className="block text-xs text-neutral-600 mt-1">ساعة</span>
                </div>
                <span className="text-4xl font-black text-neutral-700 mb-4">:</span>
                <div className="bg-neutral-950 rounded-2xl px-4 py-3 min-w-[72px]">
                  <span className="block text-5xl font-black tabular-nums text-indigo-300">{mounted ? mm : "--"}</span>
                  <span className="block text-xs text-neutral-600 mt-1">دقيقة</span>
                </div>
                <span className="text-4xl font-black text-neutral-700 mb-4">:</span>
                <div className="bg-neutral-950 rounded-2xl px-4 py-3 min-w-[72px]">
                  <span className="block text-5xl font-black tabular-nums text-cyan-400">{mounted ? ss : "--"}</span>
                  <span className="block text-xs text-neutral-600 mt-1">ثانية</span>
                </div>
              </div>
            )}

            {allowConnectMinutesBefore > 0 && mounted && !gateOpen && (
              <p className="text-xs text-neutral-600 mt-1">
                يُفتح الباب قبل البث بـ {allowConnectMinutesBefore} دقيقة
              </p>
            )}

            {/* Enter button — disabled until gate opens */}
            <button
              type="button"
              disabled={!mounted || !gateOpen || isSyncing}
              onClick={handleEnter}
              className={`mt-6 w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
                isSyncing
                  ? "bg-indigo-600/50 text-indigo-200 cursor-wait"
                  : mounted && gateOpen
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_24px_rgba(99,102,241,0.45)] animate-pulse cursor-pointer"
                    : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              }`}
            >
              {isSyncing ? "جاري المزامنة مع الخادم..." : mounted && gateOpen ? "⏎ دخول الاستوديو" : "الاستوديو مغلق حتى يحين الموعد"}
            </button>

            {/* Manual refresh — check if schedule was updated */}
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleEnter}
              className="mt-2 w-full py-2 rounded-xl text-xs text-neutral-500 hover:text-neutral-300 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/40 hover:border-neutral-600 transition-all disabled:opacity-50"
            >
              ↻ تحديث حالة الجدول
            </button>

          </div>

          {/* Session info card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3 text-sm">
            {(programTitle || stationName) && (
              <div className="pb-3 border-b border-neutral-800 space-y-2">
                {programTitle && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">البرنامج</span>
                    <span className="font-semibold text-indigo-300">{programTitle}</span>
                  </div>
                )}
                {stationName && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">المحطة</span>
                    <span className="text-cyan-300">{stationName}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">بداية الجلسة</span>
              <span className="text-neutral-200 font-medium">{nextBroadcastTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">نهاية الجلسة</span>
              <span className="text-neutral-200 font-medium">{sessionEndTime}</span>
            </div>
            {allowConnectMinutesBefore > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">فتح الباب قبل الموعد</span>
                <span className="text-amber-400 font-medium">{allowConnectMinutesBefore} دقيقة</span>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Latest Recordings ── */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              آخر التسجيلات
            </h2>
            <Link
              href="/studio/recordings"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              أرشيف تسجيلاتي
              <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>

          {latestRecordings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center">
              <div className="w-14 h-14 bg-neutral-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-neutral-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <p className="text-neutral-500 text-sm">لا توجد تسجيلات بعد.</p>
              <p className="text-neutral-700 text-xs mt-1">ستظهر هنا بعد أول بثّ.</p>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              <RecordingCompactList recordings={latestRecordings} />

              {/* Full archive link at bottom */}
              <div className="border-t border-neutral-800 px-4 py-3">
                <Link
                  href="/studio/recordings"
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-indigo-400 hover:text-indigo-300 hover:bg-indigo-600/10 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  عرض كل التسجيلات
                </Link>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
