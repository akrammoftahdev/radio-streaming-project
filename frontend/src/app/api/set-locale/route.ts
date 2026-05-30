import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/prisma';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

export async function POST(req: NextRequest) {
  try {
    const { locale } = await req.json();
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
      return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 });
    }

    // Set cookie
    const response = NextResponse.json({ ok: true });
    response.cookies.set('NEXT_LOCALE', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });

    // Save to user profile if authenticated
    const session = await auth();
    if (session?.user?.id) {
      await db.user.update({
        where: { id: session.user.id },
        data: { preferredLanguage: locale },
      });
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Failed to set locale' }, { status: 500 });
  }
}
