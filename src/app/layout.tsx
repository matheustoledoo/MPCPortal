import type { Metadata, Viewport } from 'next';

import { ProvedorAvisos } from '@/components/ui';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PortalMPC',
    template: '%s · PortalMPC',
  },
  description: 'Sistema interno de gestão do escritório contábil MPC.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2b5089',
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <ProvedorAvisos>{children}</ProvedorAvisos>
      </body>
    </html>
  );
}
