import type { Metadata, Viewport } from 'next';
import { Rajdhani, Share_Tech_Mono } from 'next/font/google';
import './globals.css';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-tech-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#05070b',
};

export const metadata: Metadata = {
  title: 'Corellian Spike Sabacc',
  description: 'Outer Rim Holotable — Solo, Daily Kessel Run & Multiplayer Corellian Spike Sabacc',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sabacc',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${shareTechMono.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-[#05070b] text-slate-100 antialiased selection:bg-amber-400/30 selection:text-amber-200"
      >
        {children}
      </body>
    </html>
  );
}
