"use server";

import { auth, prisma } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";

// ── updateMyProfile ───────────────────────────────────────────────────────────
// Updates name, email, phone on User and avatarUrl on PresenterProfile (upsert).
// Does NOT change username, role, or presenterMode.

export async function updateMyProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const name      = (formData.get("name")      as string | null)?.trim() || null;
  const email     = (formData.get("email")     as string | null)?.trim() || null;
  const phone     = (formData.get("phone")     as string | null)?.trim() || null;
  const avatarUrl = (formData.get("avatarUrl") as string | null)?.trim() || null;

  // ── Email format + uniqueness ─────────────────────────────────────────────
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      redirect("/profile?error=email_format");
    }
    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) {
      redirect("/profile?error=email_taken");
    }
  }

  // ── Basic URL validation for avatarUrl ────────────────────────────────────
  if (avatarUrl) {
    try {
      new URL(avatarUrl);
    } catch {
      redirect("/profile?error=avatar_url");
    }
  }

  // ── Update User ───────────────────────────────────────────────────────────
  await prisma.user.update({
    where: { id: userId },
    data:  { name, email, phone },
  });

  // ── Upsert PresenterProfile for avatarUrl ─────────────────────────────────
  // We store avatarUrl on PresenterProfile for all user types because:
  //   1. No avatar field exists on User itself.
  //   2. PresenterProfile is a generic profile sub-record; using it for all
  //      roles is safe and requires no schema change.
  await prisma.presenterProfile.upsert({
    where:  { userId },
    create: { userId, avatarUrl: avatarUrl ?? null },
    update: { avatarUrl: avatarUrl ?? null },
  });

  revalidatePath("/profile");
  redirect("/profile?saved=profile");
}

// ── changeMyPassword ──────────────────────────────────────────────────────────
// Verifies current password then hashes + saves the new password.
// Never touches any other field.

export async function changeMyPassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const currentPassword  = (formData.get("currentPassword")  as string | null)?.trim() ?? "";
  const newPassword      = (formData.get("newPassword")      as string | null)?.trim() ?? "";
  const confirmPassword  = (formData.get("confirmPassword")  as string | null)?.trim() ?? "";

  if (!currentPassword) redirect("/profile?pwError=current_empty#change-password");
  if (!newPassword)     redirect("/profile?pwError=new_empty#change-password");
  if (!confirmPassword) redirect("/profile?pwError=confirm_empty#change-password");

  if (newPassword.length < 6)              redirect("/profile?pwError=short#change-password");
  if (newPassword !== confirmPassword)     redirect("/profile?pwError=mismatch#change-password");

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { passwordHash: true },
  });
  if (!user) redirect("/login");

  const isCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCorrect) redirect("/profile?pwError=wrong_current#change-password");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash },
  });

  revalidatePath("/profile");
  redirect("/profile?saved=password#change-password");
}

// ── Direct DJ Radio Actions ───────────────────────────────────────────────────
// All actions gate on: session auth + presenterMode === DIRECT_DJ + row ownership.

async function assertDirectDjSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { presenterMode: true },
  });
  if (user?.presenterMode !== "DIRECT_DJ") redirect("/profile");
  return userId;
}

// ── createMyDirectDjRadio ─────────────────────────────────────────────────────

export async function createMyDirectDjRadio(formData: FormData) {
  const userId = await assertDirectDjSession();

  const radioName  = (formData.get("radioName")  as string | null)?.trim() ?? "";
  const host       = (formData.get("host")       as string | null)?.trim() ?? "";
  const portRaw    = (formData.get("port")       as string | null)?.trim() ?? "";
  const djUsername = (formData.get("djUsername") as string | null)?.trim() ?? "";
  const password   = (formData.get("password")   as string | null)?.trim() ?? "";
  const mount      = (formData.get("mount")      as string | null)?.trim() || null;
  const sid        = (formData.get("sid")        as string | null)?.trim() || null;
  const bitrateRaw = (formData.get("bitrate")    as string | null)?.trim() ?? "128";
  const isActive   = formData.get("isActive") === "on";

  if (!radioName)  redirect("/profile?djError=radio_name_required#dj-radios");
  if (!host)       redirect("/profile?djError=host_required#dj-radios");
  const port = parseInt(portRaw, 10);
  if (!portRaw || isNaN(port) || port < 1 || port > 65535)
    redirect("/profile?djError=port_invalid#dj-radios");
  if (!djUsername) redirect("/profile?djError=dj_username_required#dj-radios");
  if (!password)   redirect("/profile?djError=password_required#dj-radios");
  const bitrate = parseInt(bitrateRaw, 10) || 128;

  const { encrypt } = await import("@/lib/encryption");
  const encryptedPassword = encrypt(password);

  await prisma.directDjRadio.create({
    data: { presenterId: userId, radioName, host, port, djUsername, encryptedPassword, mount, sid, bitrate, isActive },
  });

  revalidatePath("/profile");
  redirect("/profile?djSaved=created#dj-radios");
}

// ── updateMyDirectDjRadio ─────────────────────────────────────────────────────

export async function updateMyDirectDjRadio(formData: FormData) {
  const userId = await assertDirectDjSession();

  const radioId    = (formData.get("radioId")    as string | null)?.trim() ?? "";
  const radioName  = (formData.get("radioName")  as string | null)?.trim() ?? "";
  const host       = (formData.get("host")       as string | null)?.trim() ?? "";
  const portRaw    = (formData.get("port")       as string | null)?.trim() ?? "";
  const djUsername = (formData.get("djUsername") as string | null)?.trim() ?? "";
  const password   = (formData.get("password")   as string | null)?.trim() || null;
  const mount      = (formData.get("mount")      as string | null)?.trim() || null;
  const sid        = (formData.get("sid")        as string | null)?.trim() || null;
  const bitrateRaw = (formData.get("bitrate")    as string | null)?.trim() ?? "128";
  const isActive   = formData.get("isActive") === "on";

  if (!radioId)    redirect("/profile?djError=radio_id_required#dj-radios");
  if (!radioName)  redirect("/profile?djError=radio_name_required#dj-radios");
  if (!host)       redirect("/profile?djError=host_required#dj-radios");
  const port = parseInt(portRaw, 10);
  if (!portRaw || isNaN(port) || port < 1 || port > 65535)
    redirect("/profile?djError=port_invalid#dj-radios");
  if (!djUsername) redirect("/profile?djError=dj_username_required#dj-radios");
  const bitrate = parseInt(bitrateRaw, 10) || 128;

  const existing = await prisma.directDjRadio.findUnique({
    where:  { id: radioId },
    select: { presenterId: true, encryptedPassword: true },
  });
  if (!existing || existing.presenterId !== userId)
    redirect("/profile?djError=not_found#dj-radios");

  let encryptedPassword = existing.encryptedPassword;
  if (password) {
    const { encrypt } = await import("@/lib/encryption");
    encryptedPassword = encrypt(password);
  }

  await prisma.directDjRadio.update({
    where: { id: radioId },
    data:  { radioName, host, port, djUsername, encryptedPassword, mount, sid, bitrate, isActive },
  });

  revalidatePath("/profile");
  redirect("/profile?djSaved=updated#dj-radios");
}

// ── toggleMyDirectDjRadio ─────────────────────────────────────────────────────

export async function toggleMyDirectDjRadio(formData: FormData) {
  const userId  = await assertDirectDjSession();
  const radioId = (formData.get("radioId") as string | null)?.trim() ?? "";

  if (!radioId) redirect("/profile?djError=radio_id_required#dj-radios");

  const existing = await prisma.directDjRadio.findUnique({
    where:  { id: radioId },
    select: { presenterId: true, isActive: true },
  });
  if (!existing || existing.presenterId !== userId)
    redirect("/profile?djError=not_found#dj-radios");

  await prisma.directDjRadio.update({
    where: { id: radioId },
    data:  { isActive: !existing.isActive },
  });

  revalidatePath("/profile");
  redirect("/profile?djSaved=toggled#dj-radios");
}

// ── deleteMyDirectDjRadio ─────────────────────────────────────────────────────

export async function deleteMyDirectDjRadio(formData: FormData) {
  const userId  = await assertDirectDjSession();
  const radioId = (formData.get("radioId") as string | null)?.trim() ?? "";

  if (!radioId) redirect("/profile?djError=radio_id_required#dj-radios");

  const existing = await prisma.directDjRadio.findUnique({
    where:  { id: radioId },
    select: { presenterId: true },
  });
  if (!existing || existing.presenterId !== userId)
    redirect("/profile?djError=not_found#dj-radios");

  try {
    await prisma.directDjRadio.delete({ where: { id: radioId } });
  } catch {
    // FK constraint (recordings link) — deactivate instead of hard-delete
    await prisma.directDjRadio.update({ where: { id: radioId }, data: { isActive: false } });
    revalidatePath("/profile");
    redirect("/profile?djSaved=deactivated#dj-radios");
  }

  revalidatePath("/profile");
  redirect("/profile?djSaved=deleted#dj-radios");
}

