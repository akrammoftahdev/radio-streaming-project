"use server";

import { auth, prisma } from "@/auth";
import { redirect }     from "next/navigation";
import { revalidatePath } from "next/cache";

export async function togglePresenterActive(formData: FormData) {
  const session = await auth();
  if (!session || (session.user as any).role !== "ADMIN") {
    redirect("/login");
  }

  const presenterId    = formData.get("presenterId") as string;
  const currentIsActive = formData.get("currentIsActive") === "true";

  if (!presenterId) return;

  await prisma.user.update({
    where: { id: presenterId },
    data:  { isActive: !currentIsActive },
  });

  revalidatePath("/admin/presenters");
}
