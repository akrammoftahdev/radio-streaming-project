# EGONAIR — Design Decisions Log

*Last updated: 2026-04-28*

---

## D-001 — SHOUTcast / SonicPanel Only (No Icecast)

**Decision:** The streaming output target is SonicPanel / SHOUTcast exclusively.
Icecast support must not be implemented until the SHOUTcast pipeline is fully stable in production.

**Rationale:** The station uses SonicPanel. Keeping a single streaming target reduces complexity
and avoids configuration branching. See `STREAMING_STRATEGY.md` for the formal record.

**Impact:** All FFmpeg pipeline code, credential models, and ICY metadata must target SHOUTcast v2 HTTP source protocol.

---

## D-002 — Two-Service Architecture (Next.js + backend-audio)

**Decision:** Audio processing runs in a separate Node.js service (`backend-audio`, port 4001),
not inside Next.js API routes.

**Rationale:** Next.js API routes are not designed for long-lived binary streaming connections.
FFmpeg child processes and raw TCP sockets require a persistent server process. Keeping them
separate also allows `backend-audio` to be independently restarted without affecting the web UI.

---

## D-003 — Audio Token as WebSocket Authentication

**Decision:** A short-lived JWT (`audio token`) is issued by the Next.js server when the presenter
activates the mic. This token is passed as a query parameter on the WebSocket URL.
`backend-audio` validates it via an internal HTTP POST to Next.js before accepting the connection.

**Rationale:** WebSockets cannot carry custom HTTP headers in browser environments.
The query-parameter token is the standard workaround. The token is short-lived (minutes) and
validated server-to-server, so it is not a meaningful attack surface.

**Security rule derived from this decision:** DJ/SonicPanel credentials are never sent to the browser.
They are fetched server-side (Next.js decrypts from DB) and returned to `backend-audio` only
over the localhost internal API response.

---

## D-004 — AES-256-GCM Encryption for SonicPanel Credentials

**Decision:** DJ passwords and stream passwords stored in `SonicPanelCredential` are encrypted with
AES-256-GCM before database persistence. The encryption key is held in `ENCRYPTION_KEY` env var.

**Rationale:** The SQLite database file could be accessed by anyone with server access.
Encrypting credentials at rest ensures that a DB file leak alone does not expose broadcast credentials.

---

## D-005 — Duplicate Session Guard in backend-audio

**Decision:** `backend-audio` maintains an `activeSessions` Map keyed by `presenterId`.
A second WebSocket connection from the same presenter is immediately rejected with code 1008
and a message containing the word "duplicate".

**Rationale:** Radio broadcasting requires exactly one source per station slot. Allowing two
concurrent connections from the same presenter would corrupt the SHOUTcast stream.

**StudioUI side:** The studio detects the 1008 + "duplicate" close event and shows an Arabic
error message to the user.

---

## D-006 — Feature Flag for Live SHOUTcast (`ENABLE_SHOUTCAST_LIVE`)

**Decision:** The live FFmpeg → SHOUTcast pipeline in `backend-audio/src/index.ts` is behind
an environment variable flag. When `false` (default), only local WebM recording runs.

**Rationale:** Allows safe development and testing of the WebSocket / token / session flows
without accidentally opening a live SHOUTcast source connection. The flag is enabled explicitly
when performing live integration tests.

---

## D-007 — Schedule Gate on Studio Access

**Decision:** The `/studio` route is only accessible during the presenter's scheduled broadcast window.
Access is computed server-side using `BroadcastSchedule.startDatetime`, `endDatetime`,
and `allowConnectMinutesBefore`. A wait screen is shown before the window; a closed message after.

**Rationale:** Prevents presenters from connecting outside their assigned slot, which would otherwise
allow unsanctioned use of the SHOUTcast source.

---

## D-008 — SQLite for Development, Migration Path Open

**Decision:** Prisma is configured with SQLite for the current development phase.

**Rationale:** Simplifies local development — no database server to run. The Prisma schema
is designed to be provider-agnostic. When the project moves to production, the `datasource` block
in `schema.prisma` can be switched to PostgreSQL or MySQL with minimal schema changes.

---

## D-009 — Dual Recording Output (WebM local + MP3 SHOUTcast)

**Decision:** Every active session writes two simultaneous outputs:
1. Raw WebM from browser → local file (`debug-recordings/`)
2. FFmpeg-transcoded MP3 → SHOUTcast TCP socket (live broadcast)

**Rationale:** The local WebM file serves as a session archive and allows post-session conversion
to MP3 for presenter download. It also serves as a fallback if the SHOUTcast connection fails.

---

## D-010 — Media Library is Admin-Managed, Presenter-Read-Only

**Decision:** Presenters can browse and select tracks from the admin-managed cloud media library,
but cannot add, delete, or edit tracks or categories.

**Rationale:** Maintains editorial control over what music is broadcast. Future requirement
(see `FUTURE_REQUIREMENTS.md`) allows presenters to supplement with local device files for
a session only — but those files are session-scoped and never added to the admin library.

---

## D-011 — Next.js 15 Async Route Params (Known Framework Bug)

**Decision:** In Next.js 15 App Router, dynamic route params in `page.tsx` must be `await`-ed
as a `Promise`. Accessing `params.id` directly (without await) causes a runtime error.

**Pattern to follow:**
```typescript
// Correct for Next.js 15
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

**Do not regress this pattern when editing any `[id]` route.**

---

---

## DEC-011: Per-Filter DSP Toggles (May 28, 2026)
**Decision:** Each DSP filter group gets an independent enable/disable toggle instead of only having a global bypass.
**Rationale:** Presenters need granular control — e.g., keep compression on but disable reverb without adjusting sliders. Global bypass is all-or-nothing.
**Implementation:** Optional boolean fields in `DspParams` (`filterEnabled`, `eqEnabled`, etc.). Backward compatible — `undefined` treated as enabled.

## DEC-012: RTL Toggle Switches — `dir="ltr"` Pattern (May 28, 2026)
**Decision:** Toggle switch containers use `dir="ltr"` with explicit `left` CSS positioning.
**Alternatives Rejected:**
- `translate-x`: Breaks in RTL — dot exits container
- `inset-inline-start`: Correct positioning but Tailwind doesn't transition it
**Rationale:** Toggle switches are universally left-to-right (OFF=left, ON=right) regardless of page direction.

## DEC-013: KB Legacy Cleanup Policy (May 28, 2026)
**Decision:** All references to egyona, Cloud Run, gcloud, GitHub Actions, SQLite-as-production are marked `[HISTORICAL]` rather than deleted.
**Rationale:** Preserves context for future agents understanding migration history. Prevents confusion about current architecture.

---

*Add a new decision entry whenever a non-obvious technical or architectural choice is made.*
