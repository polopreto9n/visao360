'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { isAuthenticated, getUser, saveSubscription } from '../../lib/auth';
import { subscriptionsApi } from '../../lib/api';
import { Sidebar } from '../../components/layout/Sidebar';
import { NotificationBell } from '../../components/layout/NotificationBell';

function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const urgent = daysLeft <= 3;
  return (
    <div className={`flex items-center justify-between px-5 py-2.5 text-[13px] font-medium ${
      urgent ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
    }`}>
      <span>
        {urgent
          ? `O período de avaliação encerra em ${daysLeft} dia(s). Escolha um plano para continuar.`
          : `Período de avaliação gratuito: ${daysLeft} dia(s) restante(s).`}
      </span>
      <Link href="/planos"
        className="ml-4 px-3 py-1 bg-white text-blue-700 rounded-full text-xs font-bold hover:bg-blue-50 transition flex-shrink-0">
        Ver planos →
      </Link>
    </div>
  );
}

function PastDueBanner() {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 text-[13px] font-medium bg-amber-500 text-white">
      <span>Pagamento pendente. Regularize para manter o acesso completo.</span>
      <Link href="/recuperar"
        className="ml-4 px-3 py-1 bg-white text-amber-700 rounded-full text-xs font-bold hover:bg-amber-50 transition flex-shrink-0">
        Regularizar →
      </Link>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [isPastDue, setIsPastDue] = useState(false);
  const user = getUser();

  const checkSubscription = useCallback(async () => {
    try {
      const res = await subscriptionsApi.status();
      const { subscriptionStatus, trialDaysLeft: days } = res.data;
      saveSubscription(subscriptionStatus, days);
      if (subscriptionStatus === 'TRIAL' && days !== null) setTrialDaysLeft(days);
      if (subscriptionStatus === 'PAST_DUE') setIsPastDue(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    } else {
      setReady(true);
      checkSubscription();
    }
  }, [router, checkSubscription]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fluent-canvas min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar mobile onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((value) => !value)} />
      </div>

      {/* Main */}
      <div
        className="transition-[padding] duration-300"
        style={{ ['--dashboard-sidebar-offset' as string]: sidebarCollapsed ? '96px' : '260px' }}
      >
        <div className="lg:pl-[var(--dashboard-sidebar-offset)] transition-[padding] duration-300">
          {/* Banners */}
          {trialDaysLeft !== null && <TrialBanner daysLeft={trialDaysLeft} />}
          {isPastDue && <PastDueBanner />}

          {/* Header */}
          <header
            className="sticky top-0 z-20 px-4 pt-4 backdrop-blur-md sm:px-6 lg:px-8"
            style={{ background: 'linear-gradient(180deg, rgba(245,249,255,0.94), rgba(245,249,255,0.72), transparent)' }}
          >
            <div className="mx-auto flex h-[58px] max-w-[1536px] items-center justify-between gap-3 sm:gap-5">
              <button
                onClick={() => setSidebarOpen(true)}
                className="fluent-control flex h-10 w-10 items-center justify-center rounded-2xl text-slate-600 transition-colors hover:text-blue-700 lg:hidden"
                aria-label="Abrir menu"
              >
                <Menu size={19} />
              </button>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <NotificationBell />
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)]"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
                  title={user?.name}
                >
                  {user?.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="mx-auto max-w-[1536px] px-4 pb-6 pt-2 sm:px-5 lg:px-6 lg:pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
