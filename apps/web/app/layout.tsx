import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { colors } from '@oda/ui-tokens';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  // Absolute URLs for link previews (og:image) use the configured shop base URL.
  metadataBase: new URL(process.env.PUBLIC_SHOP_BASE_URL ?? 'http://localhost:3000'),
  title: 'oda · Your free shop link',
  description: 'A free shop link for Kenyan social sellers. Buyers pay you directly on M-Pesa.',
};

export const viewport: Viewport = {
  themeColor: colors.navy,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
