'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { subscriptionsApi, SubscriptionStatus } from '../../../lib/api';
import { SUBSCRIPTION_LABELS, PLAN_LABELS, formatDate } from '../../../lib/auth';

const STATUS_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  TRIAL:     { color: 'text-blue-700',  icon: '🎯', bg: 'bg-blue-50 border-blue-200' },
  ACTIVE:    { color: 'text-green-700', icon: '✅', bg: 'bg-green-50 border-green-200' },
  PAST_DUE:  { color: 'text-yellow-700',icon: '⚠️', bg: 'bg-yellow-50 border-yellow-200' },
  SUSPENDED: { color: 'text-red-700',   icon: '🚫', bg: 'bg-red-50 border-red-200' },
  CANCELLED: { color: 'text-gray-600',  icon: '✖️', bg: 'bg-gray-50 border-gray-200' },
};

const PLAN_PRICES: Record<string, string> = {
  TRIAL:        'Grátis',
  STARTER:      'R$ 149/mês',
  PROFESSIONAL: 'R$ 349/mês',
  ENTERPRISE:   'R$ 799/mês',
};

export default function ContaPage() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await subscriptionsApi.status();
      setSub(res.data);
    } catch {
      setError('Não foi possível carregar as informações da assinatura.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-10">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium mb-4">{error}</p>
          <button onClick={load} className="text-sm text-blue-600 hover:underline">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[sub?.subscriptionStatus ?? ''] ?? STATUS_CONFIG.TRIAL;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Assinatura</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gerencie seu plano e informações de cobrança.
        </p>
      </div>

      {/* Status Card */}
      <div className={`border-2 rounded-2xl p-6 ${cfg.bg}`}>
        <div className="flex items-start gap-4">
          <div className="text-3xl">{cfg.icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className={`text-xl font-bold ${cfg.color}`}>
                {SUBSCRIPTION_LABELS[sub?.subscriptionStatus ?? ''] ?? sub?.subscriptionStatus}
              </h2>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                {sub?.subscriptionStatus}
              </span>
            </div>
            <p className={`text-sm mt-1 ${cfg.color} opacity-80`}>
              {sub?.subscriptionStatus === 'TRIAL' && sub.trialDaysLeft !== null && (
                <>
                  {sub.trialDaysLeft > 0
                    ? `${sub.trialDaysLeft} dia(s) restante(s) no período de avaliação`
                    : 'Período de avaliação encerrado'}
                </>
              )}
              {sub?.subscriptionStatus === 'ACTIVE' && 'Sua assinatura está ativa e em dia.'}
              {sub?.subscriptionStatus === 'PAST_DUE' && 'Pagamento pendente — regularize para manter o acesso.'}
              {sub?.subscriptionStatus === 'SUSPENDED' && 'Acesso suspenso por falta de pagamento.'}
              {sub?.subscriptionStatus === 'CANCELLED' && 'Assinatura cancelada.'}
            </p>
          </div>
        </div>
      </div>

      {/* Detalhes */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-sm text-gray-500">Plano atual</span>
          <span className="text-sm font-semibold text-gray-900">
            {PLAN_LABELS[sub?.plan ?? ''] ?? sub?.plan}
          </span>
        </div>
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-sm text-gray-500">Valor</span>
          <span className="text-sm font-semibold text-gray-900">
            {PLAN_PRICES[sub?.plan ?? ''] ?? '—'}
          </span>
        </div>
        {sub?.trialEndsAt && (
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-gray-500">Trial válido até</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatDate(sub.trialEndsAt)}
            </span>
          </div>
        )}
        {sub?.currentPeriodEnd && (
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-gray-500">Próxima cobrança</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatDate(sub.currentPeriodEnd)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-sm text-gray-500">Stripe Customer</span>
          <span className="text-sm font-mono text-gray-400 text-xs">
            {sub?.stripeCustomerId ?? 'Não configurado'}
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="space-y-3">
        {(sub?.subscriptionStatus === 'TRIAL' || sub?.subscriptionStatus === 'PAST_DUE') && (
          <Link
            href="/planos"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
          >
            🚀 Ver planos e fazer upgrade
          </Link>
        )}

        {sub?.subscriptionStatus === 'ACTIVE' && sub.stripeCustomerId && (
          <a
            href="#"
            className="flex items-center justify-center gap-2 w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-3 rounded-xl transition"
          >
            💳 Gerenciar forma de pagamento
          </a>
        )}

        {(sub?.subscriptionStatus === 'SUSPENDED' || sub?.subscriptionStatus === 'CANCELLED') && (
          <Link
            href="/recuperar"
            className="flex items-center justify-center gap-2 w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition"
          >
            🔓 Recuperar acesso
          </Link>
        )}

        {sub?.subscriptionStatus === 'TRIAL' && sub.trialDaysLeft !== null && sub.trialDaysLeft <= 3 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-orange-700 font-medium text-sm">
              ⚡ Apenas {sub.trialDaysLeft} dia(s) restante(s)!
            </p>
            <p className="text-orange-600 text-xs mt-1">
              Escolha um plano agora para não perder o acesso.
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 text-center">
        Dúvidas sobre cobrança?{' '}
        <a href="mailto:financeiro@visao360.com.br" className="text-blue-600 hover:underline">
          financeiro@visao360.com.br
        </a>
      </div>
    </div>
  );
}
