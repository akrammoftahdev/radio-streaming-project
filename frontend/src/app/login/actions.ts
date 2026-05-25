"use server";
import { signIn } from "@/auth";
import { prisma } from "@/auth";
import { AuthError } from "next-auth";

export async function doLogin(
  username: string,
  password: string
): Promise<{ error?: string; role?: string }> {
  try {
    await signIn("credentials", { username, password, redirect: false });
    // Session cookie is now set. Fetch role directly — auth() won't see
    // the new cookie within the same request cycle.
    const user = await prisma.user.findUnique({
      where: { username },
      select: { role: true },
    });
    return { role: user?.role ?? "PRESENTER" };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "بيانات الدخول غير صحيحة" };
    }
    throw error;
  }
}
