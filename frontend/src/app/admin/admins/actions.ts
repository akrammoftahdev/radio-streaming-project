"use server";

import { prisma, auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcrypt";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  return session;
}

// Ensure the main admin cannot be touched.
// We'll define the main admin as the first created admin, or specifically username "akram" or ID matching the session.
// Wait, the user said "main admin can't be deleted" and "can't be deactivated".
// The main admin in this project is username "admin" usually? Let's protect "admin" username.
const MAIN_ADMIN_USERNAME = "admin";

// ── createAdmin ──────────────────────────────────────────────────────────────

export async function createAdmin(formData: FormData) {
  const session = await requireAdmin();

  const name = formData.get("name")?.toString().trim() || "";
  const username = formData.get("username")?.toString().trim() || "";
  const password = formData.get("password")?.toString().trim() || "";
  const email = formData.get("email")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const profilePhotoUrl = formData.get("profilePhoto")?.toString().trim() || null;

  if (username.length < 3) {
    redirect("/admin/admins?error=" + encodeURIComponent("Username must be at least 3 characters"));
  }
  if (password.length < 6) {
    redirect("/admin/admins?error=" + encodeURIComponent("Password must be at least 6 characters"));
  }

  // Check unique username
  const existingUser = await prisma.user.findFirst({
    where: { username: { equals: username } },
  });
  if (existingUser) {
    redirect("/admin/admins?error=" + encodeURIComponent("Username is already taken"));
  }

  // Check unique email if provided
  if (email) {
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: email } },
    });
    if (existingEmail) {
      redirect("/admin/admins?error=" + encodeURIComponent("Email is already taken"));
    }
  }

  const passwordHash = await hash(password, 10);

  const newAdmin = await prisma.user.create({
    data: {
      name: name || null,
      username,
      email,
      phone,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      canBroadcast: false,
      profile: {
        create: {
          displayName: name || username,
          avatarUrl: profilePhotoUrl,
        }
      }
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: (session.user as any).id,
      actorRole: "ADMIN",
      action: "CREATE_ADMIN",
      entityType: "USER",
      entityId: newAdmin.id,
      metadata: `Username: ${username}`,
    },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=true");
}

// ── updateAdmin ──────────────────────────────────────────────────────────────

export async function updateAdmin(formData: FormData) {
  const session = await requireAdmin();

  const id = formData.get("id")?.toString() || "";
  const name = formData.get("name")?.toString().trim() || "";
  const email = formData.get("email")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const profilePhotoUrl = formData.get("profilePhoto")?.toString().trim() || null;

  const adminUser = await prisma.user.findUnique({ where: { id } });
  if (!adminUser || adminUser.role !== "ADMIN") {
    redirect("/admin/admins?error=" + encodeURIComponent("Admin not found"));
  }

  if (email && email !== adminUser.email) {
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: email } },
    });
    if (existingEmail) {
      redirect(`/admin/admins?edit=${id}&error=` + encodeURIComponent("Email is already taken"));
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: name || null,
      email,
      phone,
      profile: {
        upsert: {
          create: {
            displayName: name || adminUser.username,
            avatarUrl: profilePhotoUrl,
          },
          update: {
            displayName: name || adminUser.username,
            avatarUrl: profilePhotoUrl,
          }
        }
      }
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: (session.user as any).id,
      actorRole: "ADMIN",
      action: "UPDATE_ADMIN_PROFILE",
      entityType: "USER",
      entityId: id,
      metadata: `Updated profile for ${adminUser.username}`,
    },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=true");
}

// ── updateAdminPassword ──────────────────────────────────────────────────────

export async function updateAdminPassword(formData: FormData) {
  const session = await requireAdmin();

  const id = formData.get("id")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const passwordConfirm = formData.get("passwordConfirm")?.toString() || "";

  if (password.length < 6) {
    redirect(`/admin/admins?edit=${id}&error=` + encodeURIComponent("Password must be at least 6 characters"));
  }
  if (password !== passwordConfirm) {
    redirect(`/admin/admins?edit=${id}&error=` + encodeURIComponent("Passwords do not match"));
  }

  const adminUser = await prisma.user.findUnique({ where: { id } });
  if (!adminUser || adminUser.role !== "ADMIN") {
    redirect("/admin/admins?error=" + encodeURIComponent("Admin not found"));
  }

  if (adminUser.username === MAIN_ADMIN_USERNAME) {
    redirect("/admin/admins?error=" + encodeURIComponent("Cannot change password for the main admin from here"));
  }

  const passwordHash = await hash(password, 10);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: (session.user as any).id,
      actorRole: "ADMIN",
      action: "UPDATE_ADMIN_PASSWORD",
      entityType: "USER",
      entityId: id,
      metadata: `Updated password for ${adminUser.username}`,
    },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=true");
}

// ── toggleAdminStatus ────────────────────────────────────────────────────────

export async function toggleAdminStatus(formData: FormData) {
  const session = await requireAdmin();

  const id = formData.get("id")?.toString();
  const targetStatus = formData.get("targetStatus")?.toString() === "true";

  if (!id) redirect("/admin/admins?error=" + encodeURIComponent("Missing ID"));
  if (id === (session.user as any).id) {
    redirect("/admin/admins?error=" + encodeURIComponent("You cannot deactivate your own account"));
  }

  const adminUser = await prisma.user.findUnique({ where: { id } });
  if (!adminUser || adminUser.role !== "ADMIN") {
    redirect("/admin/admins?error=" + encodeURIComponent("Admin not found"));
  }

  if (adminUser.username === MAIN_ADMIN_USERNAME) {
    redirect("/admin/admins?error=" + encodeURIComponent("Cannot deactivate the main admin account"));
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: targetStatus },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: (session.user as any).id,
      actorRole: "ADMIN",
      action: targetStatus ? "ACTIVATE_ADMIN" : "DEACTIVATE_ADMIN",
      entityType: "USER",
      entityId: id,
    },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=true");
}

// ── deleteAdmin ──────────────────────────────────────────────────────────────

export async function deleteAdmin(formData: FormData) {
  const session = await requireAdmin();

  const id = formData.get("id")?.toString();

  if (!id) redirect("/admin/admins?error=" + encodeURIComponent("Missing ID"));
  if (id === (session.user as any).id) {
    redirect("/admin/admins?error=" + encodeURIComponent("You cannot delete your own account"));
  }

  const adminUser = await prisma.user.findUnique({ where: { id } });
  if (!adminUser || adminUser.role !== "ADMIN") {
    redirect("/admin/admins?error=" + encodeURIComponent("Admin not found"));
  }

  if (adminUser.username === MAIN_ADMIN_USERNAME) {
    redirect("/admin/admins?error=" + encodeURIComponent("Cannot delete the main admin account"));
  }

  // Delete the admin entirely
  await prisma.user.delete({
    where: { id },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: (session.user as any).id,
      actorRole: "ADMIN",
      action: "DELETE_ADMIN",
      entityType: "USER",
      entityId: id,
      metadata: `Deleted admin username: ${adminUser.username}`,
    },
  });

  revalidatePath("/admin/admins");
  redirect("/admin/admins?saved=deleted");
}
