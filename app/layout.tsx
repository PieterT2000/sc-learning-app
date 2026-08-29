import type { ReactNode } from 'react';
import { Noto_Serif } from 'next/font/google';
import './globals.css';

const notoSerif = Noto_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const metadata = {
  title: 'Catechism Voice',
  description: 'Voice-first Westminster Shorter Catechism memorization',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={notoSerif.variable}>
      <body className="m-0 bg-page font-serif text-ink">{children}</body>
    </html>
  );
}
