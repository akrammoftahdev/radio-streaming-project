import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import PreFlightScreen from "./pre-flight-screen";
import DirectDjPreFlightScreen from "./direct-dj-pre-flight-screen";
import WaitScreen from "./wait-screen";
import { resolveCurrentOrNextProgramSession } from "@/lib/resolve-program-session";
import { Unauthorized } from "@/components/ui/Unauthorized";
import { getTranslations, getLocale } from 'next-intl/server';
import { isRtl, DATE_LOCALES } from '@/i18n/config';
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export async function generateMetadata() {
  const t = await getTranslations('studio.gate');
  return { title: t('metaTitle') };
}

// Force Next.js to always re-run this server component — never serve cached HTML.
// This ensures schedule changes are reflected immediately on next visit.
export const dynamic = "force-dynamic";

// ── Shared top navigation ───────────────────────────────────────────────────
function TopNav({ label, dir }: { label: string, dir: "rtl" | "ltr" }) {
  return (
    <div className={`absolute top-4 ${dir === 'rtl' ? 'left-4' : 'right-4'} flex items-center gap-2 z-50`}>
      <LanguageSwitcher />
      <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
        <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 bg-neutral-900 hover:bg-red-500/10 border border-neutral-800 hover:border-red-500/30 rounded-lg transition-colors h-10">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          {label}
        </button>
      </form>
    </div>
  );
}

export default async function StudioServerPage() {
  const t = await getTranslations('studio.gate');
  const tAuth = await getTranslations('auth');
  const locale = await getLocale();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES] || locale;
  const session = await auth();

  if (!session) redirect("/login");
  // Wrong role: render Unauthorized instead of redirecting to /login
  // (redirect to /login for authenticated users causes a loop).
  if ((session.user as any).role !== "PRESENTER") {
    return <Unauthorized role={(session.user as any).role ?? ""} />;
  }

  const userId = session.user?.id;
  if (!userId) redirect("/login");

  // ── Account validity guards ───────────────────────────────────────────────
  const presenter = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, canBroadcast: true, presenterMode: true, validity: { select: { validFrom: true, validTo: true } } },
  });

  // ── Account active check (all roles) ───────────────────────────────
  if (!presenter?.isActive) {
    return (
      <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative">
        <TopNav label={tAuth('logout')} dir={dir} />
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-200 mb-2">{t('accountInactive')}</h2>
          <p className="text-neutral-400">{t('accountInactiveDesc')}</p>
        </div>
      </div>
    );
  }

  // ── canBroadcast check (scheduled presenters only — DIRECT_DJ bypasses this) ──
  // For DIRECT_DJ the access gate is: isActive + validity + active radio.
  // canBroadcast is not surfaced in the admin UI for DIRECT_DJ, so it must
  // not be checked here to prevent a silent save from locking DJs out.
  if (presenter.presenterMode !== 'DIRECT_DJ' && !presenter.canBroadcast) {
    return (
      <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative">
        <TopNav label={tAuth('logout')} dir={dir} />
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-200 mb-2">{t('broadcastDisabled')}</h2>
          <p className="text-neutral-400">{t('broadcastDisabledDesc')}</p>
        </div>
      </div>
    );
  }

  const now = new Date();

  // ── DIRECT_DJ GATE ────────────────────────────────────────────────────────
  // Bypass Program Schedule resolver entirely for DIRECT_DJ presenters.
  // SINGLE_STATION and MULTI_STATION presenters fall through to the existing schedule gate.
  if (presenter?.presenterMode === 'DIRECT_DJ') {
    // ── Validity date-range check ────────────────────────────────────────────
    // If PresenterValidity rows exist and validFrom/validTo are set,
    // the account is only usable within that window.
    const validity = presenter.validity;
    if (validity) {
      if (validity.validFrom && now < validity.validFrom) {
        return (
          <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative">
            <TopNav label={tAuth('logout')} dir={dir} />
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-200 mb-2">{t('accountNotStarted')}</h2>
              <p className="text-neutral-400">{t('accountNotStartedDesc', { date: validity.validFrom.toLocaleDateString(dateLocale) })}</p>
            </div>
          </div>
        );
      }
      if (validity.validTo && now > validity.validTo) {
        return (
          <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative">
            <TopNav label={tAuth('logout')} dir={dir} />
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-200 mb-2">{t('accountExpired')}</h2>
              <p className="text-neutral-400">{t('accountExpiredDesc', { date: validity.validTo.toLocaleDateString(dateLocale) })}</p>
            </div>
          </div>
        );
      }
    }

    const radios = await prisma.directDjRadio.findMany({
      where:   { presenterId: userId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select:  { id: true, radioName: true, host: true, port: true, djUsername: true, bitrate: true, mount: true, sid: true },
    });

    const mediaCategories = await prisma.mediaCategory.findMany({
      where:   {
        isActive: true,
        OR: [
          { stationId: null },     // global — visible to all stations
          // DIRECT_DJ has no station context, so no station-specific filter
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: { tracks: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, fileUrl: true } } },
    });
    const mapCats = (type: string, ownerType?: string, ownerId?: string) =>
      mediaCategories.filter(c =>
        c.type === type &&
        (ownerType ? c.ownerType === ownerType : true) &&
        (ownerId   ? c.ownerId   === ownerId   : true)
      ).map(c => ({ id: c.id, name: c.name, ownerType: c.ownerType, tracks: c.tracks }));

    const latestRecordings = await prisma.recording.findMany({
      where:   { presenterId: userId },
      orderBy: { startedAt: 'desc' },
      take:    10,
      select:  { id: true, localPath: true, startedAt: true, durationSeconds: true },
    });

    return (
      <DirectDjPreFlightScreen
        radios={radios}
        bgCategories={mapCats('BACKGROUND', 'ADMIN')}
        songCategories={mapCats('SONG', 'ADMIN')}
        adminBreakCategories={mapCats('BREAK', 'ADMIN')}
        presenterBreakCategories={mapCats('BREAK', 'PRESENTER', userId)}
        adminAdCategories={mapCats('AD', 'ADMIN')}
        presenterAdCategories={mapCats('AD', 'PRESENTER', userId)}
        sfxCategories={mapCats('SFX', 'ADMIN')}
        latestRecordings={latestRecordings}
      />
    );
  }

  // ── STEP 1: Try Program Schedule System ──────────────────────────────────
  const programSession = await resolveCurrentOrNextProgramSession(userId, now);

  // ── STEP 2: Fall back to legacy BroadcastSchedule if no Program session ──
  const legacySchedule = programSession
    ? null
    : await prisma.broadcastSchedule.findFirst({
        where:   { presenterId: userId },
        orderBy: { startDatetime: "asc" },
      });

  // ── Unify into a common shape ─────────────────────────────────────────────
  const unified = programSession
    ? {
        scheduleId:               programSession.pseudoScheduleId,
        startDatetime:            programSession.occurrenceStart,
        endDatetime:              programSession.occurrenceEnd,
        gateOpenTime:             programSession.gateOpenTime,
        allowConnectMinutesBefore: programSession.allowConnectMinutesBefore,
        programTitle:             programSession.programTitle,
        stationName:              programSession.stationName,
        stationId:                programSession.stationId,   // ← forwarded for P0 in token/create
        isCurrent:                programSession.isCurrent,
      }
    : legacySchedule
    ? (() => {
        const allowMs = legacySchedule.allowConnectMinutesBefore * 60 * 1000;
        const gateOpenTime = new Date(legacySchedule.startDatetime.getTime() - allowMs);
        return {
          scheduleId:               legacySchedule.id,
          startDatetime:            legacySchedule.startDatetime,
          endDatetime:              legacySchedule.endDatetime,
          gateOpenTime,
          allowConnectMinutesBefore: legacySchedule.allowConnectMinutesBefore,
          programTitle:             undefined as string | undefined,
          stationName:              undefined as string | undefined,
          stationId:                legacySchedule.stationId ?? undefined as string | undefined, // legacy already has stationId
          isCurrent:                now >= gateOpenTime && now <= legacySchedule.endDatetime,
        };
      })()
    : null;

  // ── No schedule found at all ──────────────────────────────────────────────
  if (!unified) {
    return (
      <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative">
        <TopNav label={tAuth('logout')} dir={dir} />
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-200 mb-2">{t('sorry')}</h2>
          <p className="text-neutral-400 mb-6">{t('noSchedule')}</p>
          <a href="/studio/recordings" className="inline-flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            {t('myRecordings')}
          </a>
        </div>
      </div>
    );
  }

  // ── CURRENT SESSION: allow into pre-flight ────────────────────────────────
  if (unified.isCurrent) {
    const mediaCategories = await prisma.mediaCategory.findMany({
      where: {
        isActive: true,
        OR: [
          { stationId: null },                                                          // global
          ...(unified.stationId ? [{ stationId: unified.stationId }] : []),             // station-specific
        ],
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      include: {
        tracks: {
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, fileUrl: true },
        },
      },
    });

    const mapCats = (type: string, ownerType?: string, ownerId?: string) =>
      mediaCategories
        .filter(c =>
          c.type === type &&
          (ownerType ? c.ownerType === ownerType : true) &&
          (ownerId   ? c.ownerId   === ownerId   : true)
        )
        .map(c => ({ id: c.id, name: c.name, ownerType: c.ownerType, tracks: c.tracks }));

    const bgCategories             = mapCats("BACKGROUND", "ADMIN");
    const songCategories           = mapCats("SONG",       "ADMIN");
    const adminBreakCategories     = mapCats("BREAK",      "ADMIN");
    const presenterBreakCategories = mapCats("BREAK",      "PRESENTER", userId);
    const adminAdCategories        = mapCats("AD",         "ADMIN");
    const presenterAdCategories    = mapCats("AD",         "PRESENTER", userId);
    const sfxCategories            = mapCats("SFX",        "ADMIN");

    const latestRecordings = await prisma.recording.findMany({
      where:   { presenterId: userId },
      orderBy: { startedAt: "desc" },
      take:    10,
      select:  { id: true, localPath: true, startedAt: true, durationSeconds: true },
    });

    return (
      <PreFlightScreen
        bgCategories={bgCategories}
        songCategories={songCategories}
        adminBreakCategories={adminBreakCategories}
        presenterBreakCategories={presenterBreakCategories}
        adminAdCategories={adminAdCategories}
        presenterAdCategories={presenterAdCategories}
        sfxCategories={sfxCategories}
        latestRecordings={latestRecordings}
        sessionEndMs={unified.endDatetime.getTime()}
        scheduledStationId={unified.stationId ?? undefined}
      />
    );
  }

  // ── UPCOMING SESSION: show WaitScreen countdown ───────────────────────────
  if (now < unified.gateOpenTime) {
    const formatter = new Intl.DateTimeFormat(dateLocale, {
      timeZone: "Africa/Cairo",
      year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "numeric",
    });
    const nextBroadcastTime = formatter.format(unified.startDatetime);
    const sessionEndTime    = formatter.format(unified.endDatetime);

    // Fetch latest recordings so presenter can review archive while waiting
    const waitRecordings = await prisma.recording.findMany({
      where:   { presenterId: userId },
      orderBy: { startedAt: "desc" },
      take:    10,
      select:  { id: true, localPath: true, startedAt: true, durationSeconds: true },
    });

    return (
      <WaitScreen
        gateOpenTimeMs={unified.gateOpenTime.getTime()}
        sessionStartMs={unified.startDatetime.getTime()}
        sessionEndMs={unified.endDatetime.getTime()}
        nextBroadcastTime={nextBroadcastTime}
        sessionEndTime={sessionEndTime}
        allowConnectMinutesBefore={unified.allowConnectMinutesBefore}
        programTitle={unified.programTitle}
        stationName={unified.stationName}
        latestRecordings={waitRecordings}
      />
    );
  }

  // ── PAST SESSION: schedule existed but has ended ──────────────────────────
  return (
    <div dir={dir} className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <TopNav label={tAuth('logout')} dir={dir} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="z-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500"></div>
        <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14v4"/><path d="M10 16h4"/></svg>
        </div>
        <h1 className="text-2xl font-bold text-neutral-100 mb-2">{t('sessionEnded')}</h1>
        <p className="text-neutral-400 mt-2 mb-6">{t('sessionEndedDesc')}</p>
        <div className="space-y-3">
          <a href="/studio/recordings" className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            {t('myRecordings')}
          </a>
          <p className="text-xs text-neutral-600">{t('contactAdminNewSchedule')}</p>
        </div>
      </div>
    </div>
  );
}
