"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type AccountType = "SINGLE_STATION" | "MULTI_STATION" | "DIRECT_DJ";

interface Station { id: string; name: string; slug: string; }

const COLOR_MAP = {
  indigo: {
    card:  "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
    idle:  "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-indigo-500/30 hover:bg-neutral-800",
    note:  "bg-indigo-500/5 border-indigo-500/20 text-indigo-300",
    btn:   "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20",
    ring:  "focus:ring-indigo-500/50 focus:border-indigo-500",
    check: "accent-indigo-500",
  },
  cyan: {
    card:  "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    idle:  "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-cyan-500/30 hover:bg-neutral-800",
    note:  "bg-cyan-500/5 border-cyan-500/20 text-cyan-300",
    btn:   "bg-cyan-600 hover:bg-cyan-700 shadow-cyan-500/20",
    ring:  "focus:ring-cyan-500/50 focus:border-cyan-500",
    check: "accent-cyan-500",
  },
  amber: {
    card:  "border-amber-500/40 bg-amber-500/10 text-amber-300",
    idle:  "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-amber-500/30 hover:bg-neutral-800",
    note:  "bg-amber-500/5 border-amber-500/20 text-amber-300",
    btn:   "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20",
    ring:  "focus:ring-amber-500/50 focus:border-amber-500",
    check: "accent-amber-500",
  },
};

export default function NewPresenterPage() {
  const t = useTranslations('admin.presenters');

  const ACCOUNT_TYPES: {
    value: AccountType;
    icon: string;
    label: string;
    desc: string;
    color: "indigo" | "cyan" | "amber";
  }[] = [
    {
      value: "SINGLE_STATION",
      icon: "📻",
      label: t('singleStationLabel'),
      desc: t('singleStationDesc'),
      color: "indigo",
    },
    {
      value: "MULTI_STATION",
      icon: "📡",
      label: t('multiStationLabel'),
      desc: t('multiStationDesc'),
      color: "cyan",
    },
    {
      value: "DIRECT_DJ",
      icon: "🎙️",
      label: t('directDj'),
      desc: t('directDjDesc'),
      color: "amber",
    },
  ];

  const [step, setStep]               = useState<"select" | "form">("select");
  const [accountType, setAccountType] = useState<AccountType>("SINGLE_STATION");

  const [name,        setName]        = useState("");
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [isActive,    setIsActive]    = useState(true);
  const [canBroadcast,setCanBroadcast]= useState(true);

  // Station selection state
  const [stations,        setStations]        = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [singleStationId, setSingleStationId] = useState("");
  const [multiStationIds, setMultiStationIds] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState("");

  // Fetch stations whenever the form step is shown for a station-based type
  useEffect(() => {
    if (step !== "form") return;
    if (accountType === "DIRECT_DJ") return;
    setStationsLoading(true);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${basePath}/api/admin/stations`)
      .then((r) => r.json())
      .then((data: Station[] | { stations: Station[] }) => {
        const list = Array.isArray(data) ? data : (data as any).stations ?? [];
        setStations(list);
      })
      .catch(() => setStations([]))
      .finally(() => setStationsLoading(false));
  }, [step, accountType]);

  const handleSelectType = (type: AccountType) => {
    setAccountType(type);
    setStep("form");
    setSuccess(false);
    setError("");
    setSingleStationId("");
    setMultiStationIds(new Set());
  };

  const toggleMultiStation = (id: string) => {
    setMultiStationIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess(false);

    // Client-side station validation
    if (accountType === "SINGLE_STATION" && !singleStationId) {
      setError(t('validationSingleStation'));
      setIsLoading(false);
      return;
    }
    if (accountType === "MULTI_STATION" && multiStationIds.size === 0) {
      setError(t('validationMultiStation'));
      setIsLoading(false);
      return;
    }

    const stationIds =
      accountType === "SINGLE_STATION" ? [singleStationId] :
      accountType === "MULTI_STATION"  ? Array.from(multiStationIds) :
      [];

    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const res = await fetch(`${basePath}/api/admin/presenters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          password,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          isActive,
          canBroadcast: accountType !== "DIRECT_DJ" ? canBroadcast : false,
          presenterMode: accountType,
          stationIds,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(t('unexpectedResponse', { status: res.status }));
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('addError'));

      setSuccess(true);
      setName(""); setUsername(""); setPassword(""); setEmail(""); setPhone("");
      setIsActive(true); setCanBroadcast(true);
      setSingleStationId("");
      setMultiStationIds(new Set());
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || t('connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  const selected = ACCOUNT_TYPES.find((at) => at.value === accountType)!;
  const colors   = COLOR_MAP[selected.color];

  // ── Step 1: Account type selection ──────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-xl w-full mb-4">
          <Link
            href="/admin/presenters"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-indigo-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            {t('presenterList')}
          </Link>
        </div>

        <div className="max-w-xl w-full">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              {t('selectAccountType')}
            </h1>
            <p className="text-neutral-400 mt-2 text-sm">
              {t('accountTypeDesc')}
              {' '}{t('accountTypeCannotChange')}
            </p>
          </div>

          <div className="space-y-3">
            {ACCOUNT_TYPES.map((type) => {
              const c = COLOR_MAP[type.color];
              return (
                <button
                  key={type.value}
                  onClick={() => handleSelectType(type.value)}
                  className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl border transition-all text-right ${c.idle}`}
                >
                  <span className="text-3xl flex-shrink-0">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base text-neutral-100">{type.label}</div>
                    <div className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{type.desc}</div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-600 flex-shrink-0 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Type-specific creation form ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans">
      {/* Back nav */}
      <div className="max-w-md w-full mb-4 flex items-center gap-3">
        <button
          onClick={() => { setStep("select"); setError(""); setSuccess(false); }}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-indigo-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          {t('changeType')}
        </button>
        <span className="text-neutral-700">·</span>
        <Link href="/admin/presenters" className="text-sm text-neutral-400 hover:text-indigo-400 transition-colors">
          {t('presenterList')}
        </Link>
      </div>

      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-8">

        {/* Account type badge */}
        <div className={`flex items-center gap-3 mb-6 p-4 rounded-xl border ${colors.card}`}>
          <span className="text-2xl">{selected.icon}</span>
          <div>
            <div className="font-bold text-sm">{selected.label}</div>
            <div className="text-xs opacity-70 mt-0.5 leading-relaxed">{selected.desc}</div>
          </div>
        </div>

        <h1 className="text-xl font-bold text-neutral-100 mb-6 text-center">{t('addNewPresenter')}</h1>

        {/* Banners */}
        {error && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-center text-sm font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-center text-sm font-medium">
            ✅ {t('createdSuccess')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{t('fullName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="مثال: أحمد محمد"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t('username')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left font-mono"
              placeholder="ahmed_m"
              dir="ltr"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t('password')} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left font-mono"
              placeholder="ahmed@example.com"
              dir="ltr"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{t('phone')}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-left font-mono"
              placeholder="+201001234567"
              dir="ltr"
            />
          </div>

          <div className="flex flex-col gap-3 py-1">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="peer sr-only" />
                <div className="w-5 h-5 border-2 border-neutral-700 rounded bg-neutral-950 peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all group-hover:border-neutral-500"></div>
                <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <span className="text-sm font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">{t('accountActive')}</span>
            </label>

            {accountType !== "DIRECT_DJ" && (
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input type="checkbox" checked={canBroadcast} onChange={(e) => setCanBroadcast(e.target.checked)} className="peer sr-only" />
                  <div className="w-5 h-5 border-2 border-neutral-700 rounded bg-neutral-950 peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all group-hover:border-neutral-500"></div>
                  <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <span className="text-sm font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">{t('broadcastPermission')}</span>
              </label>
            )}
          </div>

          {/* ── Station selector — SINGLE_STATION ─────────────────────────────── */}
          {accountType === "SINGLE_STATION" && (
            <div className="pt-1">
              <label className="block text-sm font-semibold text-neutral-300 mb-2">
                {t('stationRequired')} <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-neutral-500 mb-3">{t('singleStationHint')}</p>
              {stationsLoading ? (
                <div className="text-xs text-neutral-500 py-3">{t('loadingStations')}</div>
              ) : stations.length === 0 ? (
                <div className="text-xs text-red-400 py-3">{t('noActiveStations')}</div>
              ) : (
                <div className="space-y-2">
                  {stations.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                        singleStationId === s.id
                          ? "border-indigo-500/40 bg-indigo-500/10"
                          : "border-neutral-800 bg-neutral-950/50 hover:border-indigo-500/20 hover:bg-neutral-900"
                      }`}
                    >
                      <input
                        type="radio"
                        name="single_station"
                        value={s.id}
                        checked={singleStationId === s.id}
                        onChange={() => setSingleStationId(s.id)}
                        className="accent-indigo-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-sm font-medium text-neutral-200">{s.name}</div>
                        <div className="text-xs font-mono text-cyan-400/70">{s.slug}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Station selector — MULTI_STATION ──────────────────────────────── */}
          {accountType === "MULTI_STATION" && (
            <div className="pt-1">
              <label className="block text-sm font-semibold text-neutral-300 mb-2">
                {t('stationsRequired')} <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-neutral-500 mb-3">{t('multiStationHint')}</p>
              {stationsLoading ? (
                <div className="text-xs text-neutral-500 py-3">{t('loadingStations')}</div>
              ) : stations.length === 0 ? (
                <div className="text-xs text-red-400 py-3">{t('noActiveStations')}</div>
              ) : (
                <div className="space-y-2">
                  {stations.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                        multiStationIds.has(s.id)
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-neutral-800 bg-neutral-950/50 hover:border-cyan-500/20 hover:bg-neutral-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={multiStationIds.has(s.id)}
                        onChange={() => toggleMultiStation(s.id)}
                        className="accent-cyan-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-sm font-medium text-neutral-200">{s.name}</div>
                        <div className="text-xs font-mono text-cyan-400/70">{s.slug}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DIRECT_DJ note ─────────────────────────────────────────────────── */}
          {accountType === "DIRECT_DJ" && (
            <div className={`flex items-start gap-2.5 p-4 rounded-xl border text-xs leading-relaxed ${colors.note}`}>
              <span className="mt-0.5 flex-shrink-0">📌</span>
              <span>
                <strong className="font-semibold">{t('directDjNote')}</strong> {t('directDjNoteDesc')}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] mt-2 ${colors.btn}`}
          >
            {isLoading ? t('adding') : t('addPresenterOfType', { type: selected.label })}
          </button>
        </form>
      </div>
    </div>
  );
}
