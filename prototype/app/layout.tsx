import type { ReactNode } from 'react';

export const metadata = {
  title: 'Catechism Voice — Prototype',
  description: 'Voice-first catechism memorization loop test',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f8f7f4', color: '#2a2a2a' }}>{children}</body>
    </html>
  );
}
