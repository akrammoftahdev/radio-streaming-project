"use client";

import { useState, useRef } from "react";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  initials: string;
}

const UPLOAD_URL = "/api/profile/avatar/upload";
const MAX_BYTES  = 5 * 1024 * 1024; // 5 MB

/**
 * Convert a deployment-neutral stored URL (/uploads/avatars/...)
 * to a display URL that includes the /stream basePath.
 * External URLs (http/https) are returned as-is.
 */
function toDisplayUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("")) return url; // already prefixed
  return `/stream${url}`;
}

export default function AvatarUpload({ currentAvatarUrl, initials }: AvatarUploadProps) {
  const [preview,  setPreview]  = useState<string | null>(toDisplayUrl(currentAvatarUrl));
  const [progress, setProgress] = useState<number>(0);
  const [status,   setStatus]   = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message,  setMessage]  = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Client-side size guard ──────────────────────────────────────────────
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setMessage(`حجم الصورة (${(file.size / 1024 / 1024).toFixed(1)} MB) يتجاوز الحد المسموح (5 MB).`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    // ── Optimistic local preview ────────────────────────────────────────────
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setStatus("uploading");
    setProgress(0);
    setMessage("");

    // ── XHR with progress tracking ──────────────────────────────────────────
    await new Promise<void>((resolve) => {
      const fd = new FormData();
      fd.append("image", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", UPLOAD_URL);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress(Math.min(90, Math.round((ev.loaded / ev.total) * 90)));
        }
      };

      xhr.onload = () => {
        setProgress(100);
        try {
          const res = JSON.parse(xhr.responseText) as { ok?: boolean; avatarUrl?: string; error?: string };
          if (xhr.status === 200 && res.ok && res.avatarUrl) {
            // Replace optimistic blob URL with the real server URL.
            // res.avatarUrl is deployment-neutral (/uploads/avatars/...);
            // prefix /stream for display in this basePath environment.
            URL.revokeObjectURL(localUrl);
            setPreview((toDisplayUrl(res.avatarUrl) ?? res.avatarUrl) + "?t=" + Date.now());
            setStatus("success");
            setMessage("تم تحديث صورة الحساب بنجاح ✅");
          } else {
            URL.revokeObjectURL(localUrl);
            setPreview(currentAvatarUrl ?? null);
            setStatus("error");
            setMessage(res.error ?? `خطأ في الرفع (${xhr.status})`);
          }
        } catch {
          URL.revokeObjectURL(localUrl);
          setPreview(currentAvatarUrl ?? null);
          setStatus("error");
          setMessage("استجابة غير متوقعة من الخادم.");
        }
        if (inputRef.current) inputRef.current.value = "";
        resolve();
      };

      xhr.onerror = () => {
        URL.revokeObjectURL(localUrl);
        setPreview(currentAvatarUrl ?? null);
        setStatus("error");
        setMessage("فشل الاتصال بالخادم.");
        if (inputRef.current) inputRef.current.value = "";
        resolve();
      };

      xhr.send(fd);
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Preview ── */}
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="معاينة الصورة"
              className="w-16 h-16 rounded-full object-cover border-2 border-neutral-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/30 to-cyan-500/20 border-2 border-neutral-700 flex items-center justify-center text-lg font-bold text-neutral-400 select-none">
              {initials}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-400 mb-0.5">
            {preview ? "تغيير صورة الحساب" : "رفع صورة للحساب"}
          </p>
          <p className="text-xs text-neutral-600">JPEG · PNG · WebP · حتى 5 MB</p>
        </div>
      </div>

      {/* ── Drop zone / label ── */}
      <label
        htmlFor="avatar-file-input"
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all cursor-pointer ${
          status === "uploading"
            ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/5 cursor-not-allowed"
            : "border-neutral-700 hover:border-indigo-500/60 hover:bg-indigo-500/5 text-neutral-400 hover:text-indigo-300"
        }`}
      >
        {status === "uploading" ? (
          <>
            <span className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin inline-block" />
            جارٍ الرفع...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            اختر صورة للرفع
          </>
        )}
      </label>
      <input
        ref={inputRef}
        id="avatar-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={status === "uploading"}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Progress bar ── */}
      {status === "uploading" && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500 text-center">{progress}%</p>
        </div>
      )}

      {/* ── Success message ── */}
      {status === "success" && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5 text-emerald-400 text-sm">
          {message}
        </div>
      )}

      {/* ── Error message ── */}
      {status === "error" && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5 text-red-400 text-sm">
          <span>❌</span>
          {message}
        </div>
      )}
    </div>
  );
}
