'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { subscriptionsApi, SubscriptionStatus } from '../../../lib/api';
import { SUBSCRIPTION_LABELS, PLAN_LABELS, formatDate } from '../../../lib/auth';

async function openBillingPortal() {
  const res = await subscriptionsApi.billingPortal();
  window.location.href = res.data.url;
}

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
  const [portalLoading, setPortalLoading] = useState(false);

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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Minha Assinatura</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Gerencie seu plano e informações de cobrança.
        </p>
      </div>

      {/* Status Card — keep semantic colors intact */}
      <div className={`border-2 rounded-2xl p-6 ${cfg.bg}`}>
        <div className="flex items-start gap-4">
          <div className="text-3xl">{cfg.icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className={`text-xl font-bold ${cfg.color}`}>
                {SUBSCRIPTION_LABELS[sub?.subscriptionStatus ?? ''] ?? sub?.subscriptionStatus}
              </h2>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                {SUBSCRIPTION_LABELS[sub?.subscriptionStatus ?? ''] ?? sub?.subscriptionStatus}
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
      <div className="rounded-2xl border divide-y"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Plano atual</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {PLAN_LABELS[sub?.plan ?? ''] ?? sub?.plan}
          </span>
        </div>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Valor</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {PLAN_PRICES[sub?.plan ?? ''] ?? '—'}
          </span>
        </div>
        {sub?.trialEndsAt && (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Avaliação válida até</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatDate(sub.trialEndsAt)}
            </span>
          </div>
        )}
        {sub?.currentPeriodEnd && (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Próxima cobrança</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatDate(sub.currentPeriodEnd)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Cliente no Stripe</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {sub?.stripeCustomerId ?? 'Não configurado'}
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="space-y-3">
        {(sub?.subscriptionStatus === 'TRIAL' || sub?.subscriptionStatus === 'PAST_DUE') && (
          <Link
            href="/planos"
            className="fluent-button fluent-button-primary h-12 w-full text-sm"
          >
            Ver planos e migrar de plano
          </Link>
        )}

        {sub?.subscriptionStatus === 'ACTIVE' && sub.stripeCustomerId && (
          <button
            onClick={async () => {
              setPortalLoading(true);
              try { await openBillingPortal(); }
              catch { setError('Não foi possível abrir o portal de pagamento. Tente novamente.'); }
              finally { setPortalLoading(false); }
            }}
            disabled={portalLoading}
            className="flex items-center justify-center gap-2 w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-3 rounded-xl transition disabled:opacity-50"
          >
            {portalLoading ? (
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : '💳'}
            Gerenciar forma de pagamento
          </button>
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
      <div className="rounded-xl p-4 text-sm text-center"
        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        Dúvidas sobre cobrança?{' '}
        <a href="mailto:financeiro@visao360.com.br" className="text-blue-600 hover:underline">
          financeiro@visao360.com.br
        </a>
      </div>
    </div>
  );
}
