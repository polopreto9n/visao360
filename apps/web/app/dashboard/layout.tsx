'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, getUser, saveSubscription } from '../../lib/auth';
import { subscriptionsApi } from '../../lib/api';
import { Sidebar } from '../../components/layout/Sidebar';
import { NotificationBell } from '../../components/layout/NotificationBell';

function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const urgent = daysLeft <= 3;
  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
      urgent
        ? 'bg-orange-500 text-white'
        : 'bg-blue-600 text-white'
    }`}>
      <span>
        {urgent
          ? `⚡ Trial encerra em ${daysLeft} dia(s)! Escolha um plano para não perder o acesso.`
          : `🎯 Trial gratuito: ${daysLeft} dia(s) restante(s).`}
      </span>
      <Link
        href="/planos"
        className="ml-4 px-3 py-1 bg-white text-blue-700 rounded-full text-xs font-bold hover:bg-blue-50 transition flex-shrink-0"
      >
        Ver planos →
      </Link>
    </div>
  );
}

function PastDueBanner() {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm font-medium bg-yellow-500 text-white">
      <span>⚠️ Pagamento pendente. Regularize para manter o acesso completo.</span>
      <Link
        href="/recuperar"
        className="ml-4 px-3 py-1 bg-white text-yellow-700 rounded-full text-xs font-bold hover:bg-yellow-50 transition flex-shrink-0"
      >
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
      if (subscriptionStatus === 'TRIAL' && days !== null) {
        setTrialDaysLeft(days);
      }
      if (subscriptionStatus === 'PAST_DUE') {
        setIsPastDue(true);
      }
    } catch {
      // 401 de subscription → interceptor redireciona para /recuperar automaticamente
    }
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar mobile onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main */}
      <div className="pl-56">
        {/* Banners de assinatura */}
        {trialDaysLeft !== null && <TrialBanner daysLeft={trialDaysLeft} />}
        {isPastDue && <PastDueBanner />}

        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-4 px-4 lg:px-6 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 leading-none">{user?.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{user?.company.name}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{user?.name.charAt(0)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
