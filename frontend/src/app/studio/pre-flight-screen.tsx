"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import StudioUI from "./studio-ui";
import LogoutButton from "./logout-button";
import { RecordingCompactList } from "@/components/recordings/RecordingPlayer";

type Track    = { id: string; title: string; fileUrl?: string };
type Category = { id: string; name: string; ownerType: string; tracks: Track[] };

type LatestRecording = {
  id:              string;
  localPath:       string;
  startedAt:       Date;
  durationSeconds: number | null;
};

interface PreFlightProps {
  bgCategories:             Category[];
  songCategories:           Category[];
  adminBreakCategories:     Category[];
  presenterBreakCategories: Category[];
  adminAdCategories:        Category[];
  presenterAdCategories:    Category[];
  latestRecordings:         LatestRecording[];
  sessionEndMs?:            number;
  scheduledStationId?:      string; // time-resolved station from server — forwarded to token/create
}

export default function PreFlightScreen({
  bgCategories,
  songCategories,
  adminBreakCategories,
  presenterBreakCategories,
  adminAdCategories,
  presenterAdCategories,
  latestRecordings,
  sessionEndMs,
  scheduledStationId,
}: PreFlightProps) {
  const [hasPassed, setHasPassed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [micStatus, setMicStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [browserStatus, setBrowserStatus] = useState<"checking" | "ok">("checking");
  const [serverStatus, setServerStatus] = useState<"checking" | "ok">("checking");

  // mounted flag: ensures first client render matches SSR (button disabled until hydrated)
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const browserTimer = setTimeout(() => setBrowserStatus("ok"), 500);
    const serverTimer  = setTimeout(() => setServerStatus("ok"), 800);
    return () => {
      clearTimeout(browserTimer);
      clearTimeout(serverTimer);
    };
  }, []);

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicStatus("granted");
    } catch (err) {
      console.error("Microphone access denied or error", err);
      setMicStatus("denied");
    }
  };

  if (hasPassed) {
    return (
      <StudioUI
        key={scheduledStationId ?? "scheduled-studio"}
        bgCategories={bgCategories}
        songCategories={songCategories}
        adminBreakCategories={adminBreakCategories}
        presenterBreakCategories={presenterBreakCategories}
        adminAdCategories={adminAdCategories}
        presenterAdCategories={presenterAdCategories}
        sessionEndMs={sessionEndMs}
        onExitStudio={() => setHasPassed(false)}
        scheduledStationId={scheduledStationId}
      />
    );
  }

  // allReady: only computed after mount so SSR and first client render are identical.
  // Before mount: always false (button disabled) — avoids disabled=null vs disabled=true mismatch.
  const allReady: boolean = mounted
    ? micStatus === "granted" && browserStatus === "ok" && serverStatus === "ok"
    : false;

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,100vw)] h-[min(600px,100vw)] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="z-10 w-full max-w-md flex flex-col gap-4">

        {/* ── Pre-flight checks card ─────────────────────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500"></div>

          <h1 className="text-2xl font-bold text-neutral-100 mb-6">تجهيز الاستوديو</h1>

          {/* ── Pre-flight check rows ─────────────────────────── */}
          <div className="space-y-4 text-right mb-8">

            {/* Browser ready */}
            <div className="flex items-center justify-between p-4 bg-neutral-950/50 rounded-xl border border-neutral-800">
              <span className="font-medium text-neutral-300">المتصفح جاهز</span>
              {mounted && browserStatus === "ok" ? (
                <span className="text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
              ) : (
                <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-400 rounded-full animate-spin inline-block"></span>
              )}
            </div>

            {/* Server ready */}
            <div className="flex items-center justify-between p-4 bg-neutral-950/50 rounded-xl border border-neutral-800">
              <span className="font-medium text-neutral-300">الاتصال بالخادم جاهز</span>
              {mounted && serverStatus === "ok" ? (
                <span className="text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
              ) : (
                <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-400 rounded-full animate-spin inline-block"></span>
              )}
            </div>

            {/* Mic permission */}
            <div className={`p-4 bg-neutral-950/50 rounded-xl border ${mounted && micStatus === "denied" ? "border-red-500/50" : "border-neutral-800"}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-300">صلاحية الميكروفون</span>
                {!mounted ? (
                  /* SSR / pre-hydration: always show spinner so server+client match */
                  <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-400 rounded-full animate-spin inline-block"></span>
                ) : micStatus === "granted" ? (
                  <span className="text-emerald-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </span>
                ) : micStatus === "denied" ? (
                  <span className="text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </span>
                ) : (
                  <button onClick={requestMicPermission} className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-lg text-xs font-medium transition-colors">
                    طلب الصلاحية
                  </button>
                )}
              </div>
              {mounted && micStatus === "denied" && (
                <p className="mt-3 text-xs text-red-400/80 bg-red-500/10 p-2 rounded leading-relaxed border border-red-500/20">
                  لقد قمت برفض أو حظر وصول المتصفح للميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح الخاص بك أعلى الشاشة بجوار الرابط وتحديث الصفحة.
                </p>
              )}
            </div>
          </div>

          {/* ── Enter studio button ─────────────────────────── */}
          {/* Two-branch mount guard: server + first client render ALWAYS produce
              the static disabled branch (mounted=false). After hydration, React
              switches to the real dynamic branch. This guarantees disabled is
              always an explicit boolean and className never differs SSR vs client. */}
          {!mounted ? (
            <button
              type="button"
              disabled={true}
              className="w-full py-3.5 font-medium rounded-xl transition-all bg-neutral-800 text-neutral-500 cursor-not-allowed"
            >
              دخول الاستوديو
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setHasPassed(true); }}
              disabled={!allReady}
              className={`w-full py-3.5 font-medium rounded-xl transition-all ${
                allReady
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              دخول الاستوديو
            </button>
          )}


        </div>

        {/* ── Archive shortcut + recordings preview ─────────────────────── */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg">
          {/* Archive link header */}
          <Link
            href="/studio/recordings"
            className="flex items-center justify-between gap-2 w-full px-4 py-3 text-sm text-neutral-400 hover:text-indigo-300 hover:bg-neutral-800/60 border-b border-neutral-800 transition-all"
          >
            <span className="flex items-center gap-2 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              أرشيف تسجيلاتي
            </span>
            <span className="text-xs text-neutral-600 flex items-center gap-1">
              عرض الكل
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </span>
          </Link>

          {/* Recordings list — shared mini-player */}
          <div className="divide-y divide-neutral-800/60">
            {latestRecordings.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-5 px-4">لا توجد تسجيلات بعد</p>
            ) : (
              <RecordingCompactList recordings={latestRecordings} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

