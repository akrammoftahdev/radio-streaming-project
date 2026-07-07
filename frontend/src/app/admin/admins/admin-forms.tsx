"use client";

import { useRef, useState, useTransition } from "react";
import { createAdmin, updateAdmin, updateAdminPassword, toggleAdminStatus } from "./actions";

// ─── AdminAvatarUpload ────────────────────────────────────────────────────────
// Uploads via XHR to /api/admin/avatar/upload (same pattern as profile page).
// Returns the saved URL via onUploaded callback.

interface AdminAvatarUploadProps {
  targetUserId: string; // "new" for create, actual ID for edit
  currentAvatarUrl?: string | null;
  onUploaded: (url: string) => void;
}

function AdminAvatarUpload({ targetUserId, currentAvatarUrl, onUploaded }: AdminAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl ?? null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setStatus("uploading");
    setErrorMsg("");

    const fd = new FormData();
    fd.append("image", file);
    // For "new" admin we don't have an ID yet — use a temp placeholder.
    // The API will save the file and return a URL; the DB record is linked
    // after the user row is created by the server action via the hidden field.
    fd.append("targetUserId", targetUserId === "new" ? "temp-admin-new" : targetUserId);

    try {
      const res = await fetch("/api/admin/avatar/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok && json.ok && json.avatarUrl) {
        URL.revokeObjectURL(localPreview);
        setPreview(json.avatarUrl);
        setStatus("done");
        onUploaded(json.avatarUrl);
      } else {
        URL.revokeObjectURL(localPreview);
        setPreview(currentAvatarUrl ?? null);
        setStatus("error");
        setErrorMsg(json.error ?? "Upload failed");
      }
    } catch {
      URL.revokeObjectURL(localPreview);
      setPreview(currentAvatarUrl ?? null);
      setStatus("error");
      setErrorMsg("Network error — upload failed");
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Avatar" className="w-12 h-12 rounded-full object-cover border border-slate-600" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold">?</div>
        )}
        <label className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          status === "uploading"
            ? "border-slate-600 text-slate-500 cursor-not-allowed"
            : "border-slate-600 hover:border-teal-500 text-slate-400 hover:text-teal-400"
        }`}>
          {status === "uploading" ? "Uploading…" : status === "done" ? "Change Photo" : "Choose Photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={status === "uploading"}
            onChange={handleChange}
            className="hidden"
          />
        </label>
        {status === "done" && <span className="text-xs text-emerald-400">✓ Uploaded</span>}
      </div>
      {status === "error" && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}

// ─── AdminCreateForm ──────────────────────────────────────────────────────────

export function AdminCreateForm() {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Inject the uploaded avatar URL (already saved to disk by the upload API)
    fd.set("profilePhoto", avatarUrl);
    startTransition(() => { createAdmin(fd); });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
        <input
          name="name"
          type="text"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
        <input
          name="username"
          type="text"
          required
          autoComplete="off"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
        <input
          name="email"
          type="email"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Phone</label>
        <input
          name="phone"
          type="text"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Profile Photo</label>
        <AdminAvatarUpload
          targetUserId="new"
          onUploaded={(url) => setAvatarUrl(url)}
        />
        <p className="text-xs text-slate-600 mt-1">Upload photo first, then click Create Admin</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors"
      >
        {isPending ? "Creating…" : "Create Admin"}
      </button>
    </form>
  );
}

// ─── AdminEditForm ────────────────────────────────────────────────────────────

interface AdminEditFormProps {
  adminId: string;
  adminUsername: string;
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  adminAvatarUrl: string | null;
  adminIsActive: boolean;
  isCurrentUser: boolean;
  isMainAdmin: boolean;
}

export function AdminEditForm({
  adminId,
  adminUsername,
  adminName,
  adminEmail,
  adminPhone,
  adminAvatarUrl,
  adminIsActive,
  isCurrentUser,
  isMainAdmin,
}: AdminEditFormProps) {
  const [avatarUrl, setAvatarUrl] = useState(adminAvatarUrl ?? "");
  const [profilePending, startProfileTransition] = useTransition();
  const [pwPending, startPwTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("profilePhoto", avatarUrl);
    startProfileTransition(() => { updateAdmin(fd); });
  };

  const handlePwSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startPwTransition(() => { updateAdminPassword(fd); });
  };

  const handleToggleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startToggleTransition(() => { toggleAdminStatus(fd); });
  };

  return (
    <div className="space-y-6">
      {/* Profile Form */}
      <form onSubmit={handleProfileSubmit} className="space-y-4">
        <input type="hidden" name="id" value={adminId} />
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
          <input
            name="name"
            type="text"
            defaultValue={adminName ?? ""}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={adminEmail ?? ""}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Phone</label>
          <input
            name="phone"
            type="text"
            defaultValue={adminPhone ?? ""}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Profile Photo</label>
          <AdminAvatarUpload
            targetUserId={adminId}
            currentAvatarUrl={adminAvatarUrl}
            onUploaded={(url) => setAvatarUrl(url)}
          />
        </div>
        <button
          type="submit"
          disabled={profilePending}
          className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {profilePending ? "Saving…" : "Save Profile"}
        </button>
      </form>

      <hr className="border-slate-700/50" />

      {/* Password Form */}
      <form onSubmit={handlePwSubmit} className="space-y-4">
        <input type="hidden" name="id" value={adminId} />
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">New Password</label>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Confirm Password</label>
          <input
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={pwPending || isMainAdmin}
          className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {pwPending ? "Updating…" : "Update Password"}
        </button>
      </form>

      {/* Toggle Active */}
      {!isCurrentUser && !isMainAdmin && (
        <>
          <hr className="border-slate-700/50" />
          <form onSubmit={handleToggleSubmit}>
            <input type="hidden" name="id" value={adminId} />
            <input type="hidden" name="targetStatus" value={(!adminIsActive).toString()} />
            <button
              type="submit"
              disabled={togglePending}
              className={`w-full py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                adminIsActive
                  ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
              }`}
            >
              {togglePending ? "…" : adminIsActive ? "Deactivate Admin" : "Activate Admin"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
