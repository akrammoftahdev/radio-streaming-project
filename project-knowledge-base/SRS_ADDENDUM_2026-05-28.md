# SRS Addendum — May 28, 2026

This addendum documents new technical requirements discovered during the recording playback fix session.

---

## 11. Mobile API Authentication — Dual Auth Support

### 11.1 Requirement
All mobile API routes that serve binary content (audio files, images, downloads) MUST accept JWT authentication via BOTH methods:
1. `Authorization: Bearer <JWT>` header (for axios/fetch requests)
2. `?token=<JWT>` URL query parameter (for native audio players, WebView, and direct URL references)

### 11.2 Rationale
- The mobile app's HTTP client (`api` module based on axios) uses Bearer headers for all requests.
- Native audio players (`expo-audio`, `AVAudioEngine`) cannot send custom HTTP headers when loading remote URLs.
- WebView components loading inline HTML cannot reliably make authenticated requests to external URLs.
- **Both methods must be supported** to accommodate all playback approaches.

### 11.3 Implementation Pattern
```typescript
// Standard pattern for mobile routes serving binary content:
let token = url.searchParams.get("token");
if (!token) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
}
if (!token) {
  return NextResponse.json({ error: "Missing token" }, { status: 401 });
}
```

---

## 12. Mobile Recording Playback — Download-Then-Play Pattern

### 12.1 Requirement
The mobile app MUST download recording files to local storage before playback — remote URL playback is NOT reliable on iOS.

### 12.2 Rationale
The following remote playback approaches were tested and ALL FAILED on iOS:
| Approach | Failure Mode |
|---|---|
| `expo-audio` `useAudioPlayer` with remote HTTPS URL | Silent failure — no error, no playback |
| WebView + HTML5 `<audio>` with remote URL | MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) |
| WebView + XHR/fetch to download blob | CORS blocked from inline HTML |
| `FileSystem.downloadAsync` | Hangs indefinitely on certain server responses |

### 12.3 Working Pattern
```
axios.get(url, { responseType: 'arraybuffer' })
  → convert to base64
  → FileSystem.writeAsStringAsync(localPath, base64, { encoding: Base64 })
  → useAudioPlayer({ uri: localPath })
```

### 12.4 Caching
- Downloaded recordings MUST be cached in `FileSystem.cacheDirectory + 'recordings/'`.
- Before downloading, the app MUST check if the file already exists locally (by size > 1KB).
- Cache is automatically cleared by iOS when storage is low.

---

## 13. expo-file-system v54 Migration Note

### 13.1 Deprecated API
In expo-file-system v54+, the following methods are deprecated:
- `makeDirectoryAsync()`, `getInfoAsync()`, `downloadAsync()`, `writeAsStringAsync()`, `readAsStringAsync()`

### 13.2 Migration Path
- **Short-term:** Import from `expo-file-system/legacy` to suppress warnings
- **Long-term:** Migrate to new `File` and `Directory` class-based API

### 13.3 Current Usage
The `RecordingMiniPlayer.tsx` uses `expo-file-system/legacy` for:
- `makeDirectoryAsync` — create recordings cache directory
- `writeAsStringAsync` — save downloaded MP3 to local file

---

## 14. Error Handling Requirements Update

### 14.1 Silent Failure Prevention
- Audio playback components MUST log the following to console:
  - The URL being requested (first 120 chars)
  - HTTP status code on response
  - File size after download
  - Any errors with full stack trace
- All HTTP errors from the play endpoint MUST be displayed to the user in the player UI (not silently swallowed).

### 14.2 Download Timeout
- File downloads for playback MUST have a maximum timeout of 30 seconds.
- On timeout, the user MUST see a clear error message.
