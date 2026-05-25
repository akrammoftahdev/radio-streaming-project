"use client";

import { useState, useEffect } from "react";
import StudioUI from "./studio-ui";
import LogoutButton from "./logout-button";
import { RecordingCompactList } from "@/components/recordings/RecordingPlayer";
import Link from "next/link";

type DirectDjRadioOption = {
  id:         string;
  radioName:  string;
  host:       string;
  port:       number;
  djUsername: string;
  bitrate:    number;
  mount:      string | null;
  sid:        string | null;
};

type Track    = { id: string; title: string; fileUrl?: string };
type Category = { id: string; name: string; ownerType: string; tracks: Track[] };
type LatestRecording = { id: string; localPath: string; startedAt: Date; durationSeconds: number | null; };

interface Props {
  radios:                   DirectDjRadioOption[];
  bgCategories:             Category[];
  songCategories:           Category[];
  adminBreakCategories:     Category[];
  presenterBreakCategories: Category[];
  adminAdCategories:        Category[];
  presenterAdCategories:    Category[];
  latestRecordings:         LatestRecording[];
}

export default function DirectDjPreFlightScreen({
  radios, bgCategories, songCategories, adminBreakCategories,
  presenterBreakCategories, adminAdCategories, presenterAdCategories, latestRecordings,
}: Props) {
  const [hasPassed,       setHasPassed]       = useState(false);
  const [mounted,         setMounted]         = useState(false);
  const [micStatus,       setMicStatus]       = useState<"pending" | "granted" | "denied">("pending");
  const [browserStatus,   setBrowserStatus]   = useState<"checking" | "ok">("checking");
  const [serverStatus,    setServerStatus]    = useState<"checking" | "ok">("checking");
  const [selectedRadioId, setSelectedRadioId] = useState<string>(radios[0]?.id ?? "");
  const [connecting,      setConnecting]      = useState(false);
  const [connectError,    setConnectError]    = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const b = setTimeout(() => setBrowserStatus("ok"), 500);
    const s = setTimeout(() => setServerStatus("ok"), 800);
    return () => { clearTimeout(b); clearTimeout(s); };
  }, []);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    }
  };

  const allReady: boolean = mounted
    ? micStatus === "granted" && browserStatus === "ok" && serverStatus === "ok" && !!selectedRadioId
    : false;

  const handleConnect = async (e?: React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!allReady || connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "");
      const res = await fetch(`${basePath}/api/internal/audio-token/create`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ directDjRadioId: selectedRadioId }),
      });
      
      // Catch NextAuth silent session redirects
      if (res.redirected || res.url.includes('/login')) {
        setConnectError("انتهت الجلسة. يرجى تسجيل الدخول مجدداً");
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err?.error ?? `فشل الاتصال (${res.status})`);
      }
      setConnecting(false);
      setHasPassed(true);
    } catch (e: unknown) {
      setConnectError((e as Error)?.message ?? "حدث خطأ أثناء الاتصال");
      setConnecting(false);
    }
  };

  if (hasPassed) {
    return (
      <StudioUI
        key={selectedRadioId}
        bgCategories={bgCategories}
        songCategories={songCategories}
        adminBreakCategories={adminBreakCategories}
        presenterBreakCategories={presenterBreakCategories}
        adminAdCategories={adminAdCategories}
        presenterAdCategories={presenterAdCategories}
        sessionEndMs={undefined}
        onExitStudio={() => { setHasPassed(false); setConnecting(false); setConnectError(null); }}
        directDjRadioId={selectedRadioId}
      />
    );
  }

  if (radios.length === 0) {
    return (
      <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="absolute top-4 left-4"><LogoutButton /></div>
        <div className="bg-neutral-900 border border-amber-500/20 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎙️</div>
          <h2 className="text-xl font-bold text-neutral-200 mb-2">لا توجد إذاعات مضافة</h2>
          <p className="text-neutral-400">لا توجد إذاعات مضافة لهذا الحساب. تواصل مع الإدارة.</p>
        </div>
      </div>
    );
  }

  const selectedRadio = radios.find(r => r.id === selectedRadioId);

  const CheckIcon = () => (
    <span className="text-emerald-400">
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
  const SpinIcon = () => <span className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-400 rounded-full animate-spin inline-block" />;
  const XIcon = () => (
    <span className="text-red-400">
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <Link
          href="/profile"
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-amber-300 border border-neutral-800 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors bg-neutral-900/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          ملفي
        </Link>
        <LogoutButton />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="z-10 w-full max-w-md flex flex-col gap-4">

        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-lg">🎙️</span>
            <h1 className="text-2xl font-bold text-neutral-100">DJ مباشر</h1>
          </div>
          <p className="text-xs text-neutral-500 mb-6">اختر الإذاعة واتصل مباشرة — بدون جدول برامج</p>

          <div className="space-y-3 text-right mb-6">
            <div className="flex items-center justify-between p-3.5 bg-neutral-950/50 rounded-xl border border-neutral-800">
              <span className="text-sm font-medium text-neutral-300">المتصفح جاهز</span>
              {mounted && browserStatus === "ok" ? <CheckIcon /> : <SpinIcon />}
            </div>
            <div className="flex items-center justify-between p-3.5 bg-neutral-950/50 rounded-xl border border-neutral-800">
              <span className="text-sm font-medium text-neutral-300">الاتصال بالخادم</span>
              {mounted && serverStatus === "ok" ? <CheckIcon /> : <SpinIcon />}
            </div>
            <div className={`p-3.5 bg-neutral-950/50 rounded-xl border ${mounted && micStatus === "denied" ? "border-red-500/50" : "border-neutral-800"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-300">صلاحية الميكروفون</span>
                {!mounted ? <SpinIcon />
                  : micStatus === "granted" ? <CheckIcon />
                  : micStatus === "denied"  ? <XIcon />
                  : (
                    <button onClick={requestMic} className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-medium transition-colors">
                      طلب الصلاحية
                    </button>
                  )}
              </div>
              {mounted && micStatus === "denied" && (
                <p className="mt-2 text-xs text-red-400/80 bg-red-500/10 p-2 rounded leading-relaxed border border-red-500/20">
                  يرجى تفعيل الميكروفون من إعدادات المتصفح وتحديث الصفحة.
                </p>
              )}
            </div>
          </div>

          <div className="mb-6 text-right">
            <label className="block text-xs font-medium text-neutral-400 mb-2">اختر الإذاعة للبث</label>
            <select
              value={selectedRadioId}
              onChange={e => setSelectedRadioId(e.target.value)}
              className="w-full bg-neutral-950 border border-amber-500/30 text-neutral-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all cursor-pointer"
            >
              {radios.map(r => (
                <option key={r.id} value={r.id}>{r.radioName}</option>
              ))}
            </select>
            {selectedRadio && (
              <p className="text-xs text-neutral-600 mt-1.5 font-mono text-left" dir="ltr">
                {selectedRadio.djUsername}@{selectedRadio.host}:{selectedRadio.port}
                {selectedRadio.mount ? ` ${selectedRadio.mount}` : ""}
                {selectedRadio.sid   ? ` SID:${selectedRadio.sid}` : ""}
                {` · ${selectedRadio.bitrate}kbps`}
              </p>
            )}
          </div>

          {connectError && (
            <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
              {connectError}
            </div>
          )}

          {!mounted ? (
            <button type="button" disabled className="w-full py-3.5 font-medium rounded-xl bg-neutral-800 text-neutral-500 cursor-not-allowed">
              اتصال مباشر
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={!allReady || connecting}
              className={`w-full py-3.5 font-medium rounded-xl transition-all ${
                allReady && !connecting
                  ? "bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_20px_rgba(217,119,6,0.4)]"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              {connecting ? "جاري تجهيز الاستوديو..." : "دخول الاستوديو 🎙️"}
            </button>
          )}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg">
          <Link
            href="/studio/recordings"
            className="flex items-center justify-between gap-2 w-full px-4 py-3 text-sm text-neutral-400 hover:text-amber-300 hover:bg-neutral-800/60 border-b border-neutral-800 transition-all"
          >
            <span className="flex items-center gap-2 font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              أرشيف تسجيلاتي
            </span>
            <span className="text-xs text-neutral-600 flex items-center gap-1">
              عرض الكل
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </Link>
          <div className="divide-y divide-neutral-800/60">
            {latestRecordings.length === 0
              ? <p className="text-xs text-neutral-600 text-center py-5 px-4">لا توجد تسجيلات بعد</p>
              : <RecordingCompactList recordings={latestRecordings} />}
          </div>
        </div>

      </div>
    </div>
  );
}
