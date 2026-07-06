"use server";

import { prisma } from "@/auth";

export async function submitListenerMessage(formData: FormData) {
  const stationId   = formData.get("stationId") as string;
  const senderName  = (formData.get("senderName") as string)?.trim();
  const email       = (formData.get("email") as string)?.trim() || null;
  const phoneNumber = (formData.get("phoneNumber") as string)?.trim() || null;
  const country     = (formData.get("country") as string)?.trim() || null;
  const messageText = (formData.get("message") as string)?.trim();

  if (!stationId || !senderName || !messageText) {
    return { error: "Missing required fields." };
  }

  try {
    const newMsg = await prisma.listenerMessage.create({
      data: {
        stationId,
        name: senderName,
        email,
        phoneNumber,
        country,
        message: messageText,
      }
    });

    // Broadcast to backend-audio
    // We try/catch this so the user still sees success even if broadcast fails
    try {
      await fetch("http://127.0.0.1:4000/internal/broadcast-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_listener_message",
          stationId,
          message: {
            id: newMsg.id,
            senderName,
            email,
            phoneNumber,
            country,
            message: messageText,
            createdAt: newMsg.createdAt.toISOString()
          }
        }),
      });
    } catch (e) {
      console.error("Failed to broadcast message to audio backend", e);
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to save message", error);
    return { error: "Failed to save message." };
  }
}

export async function checkMessagingStatus(stationId: string) {
  try {
    const station = await prisma.station.findUnique({
      where: { id: stationId },
      select: { isMessagingEnabled: true }
    });
    return station?.isMessagingEnabled ?? false;
  } catch (err) {
    return false;
  }
}
