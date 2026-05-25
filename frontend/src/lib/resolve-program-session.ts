/**
 * resolve-program-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves the CURRENT or NEXT upcoming broadcast session for a presenter
 * using the new Program Schedule System (Program → ProgramScheduleRule → Slot).
 *
 * Resolution logic:
 *   1. Fetch all active Programs for the presenter (station must be active).
 *   2. For each program expand schedule rules + slots into concrete occurrences
 *      within a 14-day window (today … today+13 days).
 *   3. Apply CANCELLED exceptions to remove matching occurrences.
 *   4. Compute gateOpenTime = occurrence.start - allowConnectMinutesBefore.
 *   5. Pick:
 *        A) "current"  — gateOpenTime <= now <= occurrence.end
 *        B) "upcoming" — the nearest future occurrence where now < gateOpenTime
 *   6. Return null if nothing found.
 *
 * Called by studio/page.tsx. Falls through to BroadcastSchedule if null.
 */

import { prisma } from "@/auth";

export interface ProgramSession {
  programId:                  string;
  programTitle:               string;
  stationId:                  string;
  stationName:                string;
  ruleId:                     string;
  allowConnectMinutesBefore:  number;
  occurrenceStart:            Date;   // concrete start of this occurrence
  occurrenceEnd:              Date;   // concrete end of this occurrence
  gateOpenTime:               Date;   // occurrenceStart - allowConnectMinutesBefore
  isCurrent:                  boolean; // true if now is between gateOpenTime and occurrenceEnd
  /** Stable pseudo-id for audio-token (no DB BroadcastSchedule row needed) */
  pseudoScheduleId:           string;
}

/** Parse "HH:MM" wall-clock time on a given calendar day in a named TZ → UTC Date. */
function applyTime(date: Date, hhmm: string, tz: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);

  // Step 1: Find what year/month/day the `date` UTC epoch corresponds to in the target TZ.
  const tzParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).formatToParts(date);
  const y  = Number(tzParts.find(p => p.type === "year")?.value);
  const mo = Number(tzParts.find(p => p.type === "month")?.value);
  const d  = Number(tzParts.find(p => p.type === "day")?.value);

  // Step 2: Build a UTC epoch that represents midnight of that calendar date in UTC.
  const midnightUTC = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);

  // Step 3: Find the UTC offset of the target TZ at that midnight epoch.
  //   We format the midnight-UTC epoch AS IF IT WERE local time in the target TZ,
  //   then read back the hours/minutes to determine how many minutes ahead/behind UTC
  //   the TZ is at that date.  Africa/Cairo is UTC+2 (standard) or UTC+3 (DST).
  const refDate = new Date(midnightUTC);
  const tzHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false })
      .formatToParts(refDate)
      .find(p => p.type === "hour")?.value ?? "0"
  );
  // If TZ is UTC+2, formatting UTC midnight gives "02" → offset = -2h (TZ is ahead, so UTC = local - 2h)
  // offsetMs = how many ms to subtract from "local midnight treated as UTC" to get real UTC midnight
  const tzOffsetMs = tzHour * 60 * 60 * 1000;

  // Step 4: The real UTC epoch for HH:MM wall-clock in the target TZ on this day:
  //   midnightUTC - tzOffsetMs + hh*3600000 + mm*60000
  const resultMs = midnightUTC - tzOffsetMs + hh * 3_600_000 + mm * 60_000;
  return new Date(resultMs);
}

/** Returns the day-of-week (0=Sun…6=Sat) for a Date in a given timezone. */
function dayOfWeekInTZ(date: Date, tz: string): number {
  // Use a reference Sunday (2006-01-01 was a Sunday) to compute offset from numeric day.
  // Simpler: use en-US with weekday:"long" and map known English names.
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" })
    .format(date);
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  return map[name] ?? 0;
}

interface RawSlot {
  id: string;
  dayOfWeek: number | null;
  slotDate: Date | null;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface RawRule {
  id: string;
  recurrenceType: string;
  timezone: string;
  allowConnectMinutesBefore: number;
  isActive: boolean;
  slots: RawSlot[];
}

interface RawProgram {
  id: string;
  title: string;
  stationId: string;
  station: { name: string; isActive: boolean };
  isActive: boolean;
  scheduleRules: RawRule[];
  exceptions: Array<{
    exceptionDate: Date;
    type: string;       // CANCELLED | EXTRA_EPISODE | SPECIAL_EVENT | RESCHEDULED
    startTime: string | null;
    endTime: string | null;
    isActive: boolean;
  }>;
}

function expandOccurrences(
  program: RawProgram,
  rule: RawRule,
  windowStart: Date,
  windowEnd: Date,
): Array<{ start: Date; end: Date }> {
  const occurrences: Array<{ start: Date; end: Date }> = [];
  const tz = rule.timezone || "Africa/Cairo";

  for (const slot of rule.slots) {
    if (!slot.isActive) continue;

    if (rule.recurrenceType === "ONE_TIME") {
      if (!slot.slotDate) continue;
      const start = applyTime(slot.slotDate, slot.startTime, tz);
      const end   = applyTime(slot.slotDate, slot.endTime,   tz);
      if (end >= windowStart && start <= windowEnd) {
        occurrences.push({ start, end });
      }
      continue;
    }

    // Iterate each day in the window
    // cursor starts at Cairo midnight (windowStart is already the correct UTC epoch for Cairo midnight).
    // Do NOT call setHours(0,0,0,0) here — that resets to server-local midnight which is wrong on UTC servers.
    const cursor = new Date(windowStart);
    while (cursor <= windowEnd) {
      let include = false;
      if (rule.recurrenceType === "DAILY") {
        include = true;
      } else if (rule.recurrenceType === "WEEKLY" || rule.recurrenceType === "SELECTED_DAYS") {
        include = dayOfWeekInTZ(cursor, tz) === slot.dayOfWeek;
      }

      if (include) {
        const start = applyTime(cursor, slot.startTime, tz);
        const end   = applyTime(cursor, slot.endTime,   tz);
        if (end >= windowStart && start <= windowEnd) {
          occurrences.push({ start, end });
        }
      }

      // Advance by exactly 24h (same as +1 calendar day at Cairo midnight UTC)
      cursor.setTime(cursor.getTime() + 24 * 3_600_000);
    }

  }

  return occurrences;
}

function isCancelledByException(
  occ: { start: Date; end: Date },
  exceptions: RawProgram["exceptions"],
  tz: string,
): boolean {
  for (const ex of exceptions) {
    if (!ex.isActive || ex.type !== "CANCELLED") continue;
    // Match by calendar date in the rule's timezone
    const excDay = applyTime(ex.exceptionDate, "00:00", tz);
    const occDay = applyTime(occ.start, "00:00", tz);
    if (excDay.toDateString() === occDay.toDateString()) return true;
  }
  return false;
}

export async function resolveCurrentOrNextProgramSession(
  userId: string,
  now: Date,
): Promise<ProgramSession | null> {
  // Window = today..+14 days in the rule timezone (Africa/Cairo).
  // IMPORTANT: Do NOT use new Date(toLocaleString()) + setHours() — that approach
  // interprets the locale string as LOCAL system time, which gives the wrong result
  // on UTC servers (off by the Cairo UTC offset = 2–3 hours).
  // Instead: use Intl to extract the Cairo calendar date, build UTC midnight for that
  // date with Date.UTC, then subtract the Cairo offset to get Cairo midnight in UTC.
  const REP_TZ = "Africa/Cairo";
  const cairoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const cy = Number(cairoParts.find(p => p.type === "year")?.value);
  const cm = Number(cairoParts.find(p => p.type === "month")?.value);
  const cd = Number(cairoParts.find(p => p.type === "day")?.value);
  // UTC midnight of the Cairo calendar date (e.g. 2026-05-11T00:00:00Z)
  const calDateMidnightUTC = Date.UTC(cy, cm - 1, cd, 0, 0, 0, 0);
  // Cairo offset at that midnight (e.g. 03:00 Cairo when UTC midnight → tzHour = 3)
  const cairoHourAtMidnight = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: REP_TZ, hour: "numeric", hour12: false })
      .formatToParts(new Date(calDateMidnightUTC))
      .find(p => p.type === "hour")?.value ?? "0"
  );
  // Cairo midnight as UTC = Date.UTC(y,m,d,0,0,0) - cairoOffset
  // e.g. UTC+3: 2026-05-11T00:00:00Z - 3h = 2026-05-10T21:00:00Z = Cairo midnight ✓
  const windowStart = new Date(calDateMidnightUTC - cairoHourAtMidnight * 3_600_000);
  const windowEnd   = new Date(windowStart.getTime() + 14 * 24 * 3_600_000);

  const programs: RawProgram[] = await prisma.program.findMany({
    where: {
      presenterId: userId,
      isActive: true,
      station: { isActive: true },
    },
    include: {
      station: { select: { name: true, isActive: true } },
      scheduleRules: {
        where: { isActive: true },
        include: { slots: { where: { isActive: true } } },
      },
      exceptions: {
        where: { isActive: true },
        select: { exceptionDate: true, type: true, startTime: true, endTime: true, isActive: true },
      },
    },
  }) as RawProgram[];

  let currentSession: ProgramSession | null = null;
  let nextSession:    ProgramSession | null = null;

  for (const prog of programs) {
    if (!prog.station.isActive) continue;

    for (const rule of prog.scheduleRules) {
      const tz = rule.timezone || "Africa/Cairo";
      const occurrences = expandOccurrences(prog, rule, windowStart, windowEnd);

      for (const occ of occurrences) {
        if (isCancelledByException(occ, prog.exceptions, tz)) continue;

        const gateOpenMs   = rule.allowConnectMinutesBefore * 60 * 1000;
        const gateOpen     = new Date(occ.start.getTime() - gateOpenMs);
        const isCurrent    = now >= gateOpen && now <= occ.end;
        const isUpcoming   = now < gateOpen;

        const session: ProgramSession = {
          programId:                 prog.id,
          programTitle:              prog.title,
          stationId:                 prog.stationId,
          stationName:               prog.station.name,
          ruleId:                    rule.id,
          allowConnectMinutesBefore: rule.allowConnectMinutesBefore,
          occurrenceStart:           occ.start,
          occurrenceEnd:             occ.end,
          gateOpenTime:              gateOpen,
          isCurrent,
          pseudoScheduleId: `program:${prog.id}:${occ.start.getTime()}`,
        };

        if (isCurrent && !currentSession) {
          currentSession = session;
        } else if (isUpcoming) {
          if (!nextSession || gateOpen < nextSession.gateOpenTime) {
            nextSession = session;
          }
        }
      }
    }
  }

  return currentSession ?? nextSession ?? null;
}
