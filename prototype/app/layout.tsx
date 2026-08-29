import type { ReactNode } from 'react';
import { Noto_Serif } from 'next/font/google';
import './globals.css';

const notoSerif = Noto_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const metadata = {
  title: 'Catechism Voice — Prototype',
  description: 'Voice-first catechism memorization loop test',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={notoSerif.className}
        style={{ margin: 0, background: '#f8f7f4', color: '#2a2a2a' }}
      >
        {children}
      </body>
    </html>
  );
}
