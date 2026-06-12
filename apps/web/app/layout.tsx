import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../lib/theme';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Visão360 — Gestão Predial Inteligente',
    template: '%s | Visão360',
  },
  description:
    'Plataforma SaaS de inteligência operacional para gestão predial. ' +
    'Checklists digitais, ordens de serviço, auditoria de equipamentos e painel em tempo real.',
  keywords: ['gestão operacional', 'gestão predial', 'condomínio', 'checklist', 'ordem de serviço'],
  authors: [{ name: 'Visão360' }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
