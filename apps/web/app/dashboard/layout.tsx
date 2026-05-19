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
          ? `⚡ Trial encerra em ${daysLeft} dia(s) — escolha um plano para continuar.`
          : `🎯 Trial gratuito: ${daysLeft} dia(s) restante(s).`}
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
      <span>⚠️ Pagamento pendente. Regularize para manter o acesso completo.</span>
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
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
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
        <Sidebar />
      </div>

      {/* Main */}
      <div className="lg:pl-60">
        {/* Banners */}
        {trialDaysLeft !== null && <TrialBanner daysLeft={trialDaysLeft} />}
        {isPastDue && <PastDueBanner />}

        {/* Header */}
        <header
          className="h-[60px] flex items-center gap-4 px-5 sticky top-0 z-20 backdrop-blur-sm"
          style={{
            background: 'var(--header-bg)',
            borderBottom: '1px solid var(--header-border)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Menu size={18} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="text-right">
                <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                  {user?.name}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {user?.company.name}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                style={{ background: 'var(--accent)' }}>
                {user?.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-5 lg:p-7 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}
