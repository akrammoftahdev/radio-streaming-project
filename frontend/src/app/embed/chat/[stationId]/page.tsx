import { prisma } from "@/auth";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import ChatForm from "./ChatForm";

export const dynamic = "force-dynamic";

export default async function ChatEmbedPage({ params }: { params: Promise<{ stationId: string }> }) {
  const resolvedParams = await params;
  const station = await prisma.station.findUnique({
    where: { id: resolvedParams.stationId },
    select: { 
      id: true,
      isMessagingEnabled: true,
      iframeTextColor: true,
      iframeBgColor: true,
      iframeBorderColor: true,
      iframePlaceholderColor: true,
      iframeLanguage: true,
    }
  });

  if (!station) {
    return notFound();
  }

  const locale = station.iframeLanguage || "ar";
  const tl = await getTranslations({ locale, namespace: "studio.LiveMessaging" });
  const translations = {
    title: tl("title"),
    offlineMessage: tl("offlineMessage"),
    name: tl("name"),
    email: tl("email"),
    phone: tl("phone"),
    country: tl("country"),
    message: tl("message"),
    send: tl("send"),
    success: tl("success"),
    error: tl("error"),
    selectCountry: tl("selectCountry")
  };

  const colors = {
    textColor: station.iframeTextColor,
    bgColor: station.iframeBgColor,
    borderColor: station.iframeBorderColor,
    placeholderColor: station.iframePlaceholderColor,
  };

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"}>
      <ChatForm 
        stationId={station.id} 
        translations={translations} 
        colors={colors}
        isMessagingEnabled={station.isMessagingEnabled}
      />
    </div>
  );
}
