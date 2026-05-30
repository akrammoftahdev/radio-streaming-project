import { Noto_Kufi_Arabic, Inter } from 'next/font/google';

export const notoKufiArabic = Noto_Kufi_Arabic({
  variable: '--font-noto-kufi-arabic',
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
});

export const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});
