import { Tajawal, Inter } from 'next/font/google';

export const tajawal = Tajawal({
  variable: '--font-tajawal',
  subsets: ['arabic'],
  weight: ['300', '400', '500', '700'],
});

export const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});
