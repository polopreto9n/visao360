'use client';

import { useState } from 'react';
import Link from 'next/link';
import { subscriptionsApi, authApi, RecoverResult } from '../../lib/api';
import { SUBSCRIPTION_LABELS, PLAN_LABELS } from '../../lib/auth';

type Step = 'email' | 'form' | 'result';

interface CompanyOption {
  id: string;
  name: string;
  logoUrl: string | null;
}

export default function RecuperarPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<RecoverResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFindCompanies(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.findCompanies(email);
      const list = res.data;
      if (!list || list.length === 0) {
        setError('Nenhuma empresa encontrada para este e-mail.');
        return;
      }
      setCompanies(list);
      if (list.length === 1) {
        setSelectedCompany(list[0]);
        setStep('form');
      } else {
        setStep('form');
      }
    } catch {
      setError('Erro ao buscar empresas. Verifique o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany) return;
    setError('');
    setLoading(true);
    try {
      const res = await subscriptionsApi.recover(email, selectedCompany.id, password);
      setResult(res.data);
      setStep('result');
    } catch {
      setError('Credenciais inválidas. Verifique e-mail e senha.');
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    TRIAL: 'bg-blue-50 border-blue-200 text-blue-800',
    ACTIVE: 'bg-green-50 border-green-200 text-green-800',
    PAST_DUE: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    SUSPENDED: 'bg-red-50 border-red-200 text-red-800',
    CANCELLED: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-black text-white">V</span>
            </div>
            <span className="text-2xl font-black text-white">
              Visão<span className="text-blue-400">360</span>
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Passo 1 — Email */}
          {step === 'email' && (
            <>
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
                <span className="text-2xl">🔓</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Recuperar acesso</h2>
              <p className="text-gray-500 mb-6 text-sm">
                Informe seu e-mail para verificar o status da sua conta.
              </p>

              <form onSubmit={handleFindCompanies} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    required
                    autoFocus
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
                >
                  {loading ? 'Buscando...' : 'Continuar →'}
                </button>
              </form>
            </>
          )}

          {/* Passo 2 — Empresa + senha */}
          {step === 'form' && (
            <>
              <button
                onClick={() => { setStep('email'); setError(''); }}
                className="text-gray-400 hover:text-gray-600 text-sm mb-4 flex items-center gap-1"
              >
                ← Voltar
              </button>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Verificar conta</h2>
              <p className="text-gray-500 mb-5 text-sm">
                Selecione a empresa e confirme sua senha.
              </p>

              <form onSubmit={handleRecover} className="space-y-4">
                {companies.length > 1 && !selectedCompany && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Empresa</label>
                    {companies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCompany(c)}
                        className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl transition text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 font-bold text-sm">{c.name.charAt(0)}</span>
                        </div>
                        <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {(selectedCompany || companies.length === 1) && (
                  <>
                    {!selectedCompany && companies[0] && (
                      <div
                        onClick={() => setSelectedCompany(companies[0])}
                        className="hidden"
                      />
                    )}
                    {(() => { if (!selectedCompany && companies[0]) setSelectedCompany(companies[0]); return null; })()}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 font-bold text-sm">
                          {(selectedCompany ?? companies[0]).name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {(selectedCompany ?? companies[0]).name}
                        </p>
                        <p className="text-xs text-gray-400">{email}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoFocus
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      />
                    </div>
                  </>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || (!selectedCompany && companies.length > 1)}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
                >
                  {loading ? 'Verificando...' : 'Verificar status'}
                </button>
              </form>
            </>
          )}

          {/* Passo 3 — Resultado */}
          {step === 'result' && result && (
            <>
              <div className="text-center mb-5">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🏢</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{result.companyName}</h2>
                <p className="text-gray-400 text-sm mt-1">{email}</p>
              </div>

              {/* Status badge */}
              <div className={`border rounded-xl px-4 py-3 mb-5 text-sm font-medium ${statusColor[result.subscriptionStatus] ?? 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span>Status da assinatura</span>
                  <span className="font-bold">
                    {SUBSCRIPTION_LABELS[result.subscriptionStatus] ?? result.subscriptionStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs opacity-75">
                  <span>Plano</span>
                  <span>{PLAN_LABELS[result.plan] ?? result.plan}</span>
                </div>
                {result.trialDaysLeft !== null && (
                  <div className="flex items-center justify-between text-xs opacity-75 mt-0.5">
                    <span>Trial restante</span>
                    <span>{result.trialDaysLeft} dia(s)</span>
                  </div>
                )}
              </div>

              {/* Mensagem */}
              <p className="text-sm text-gray-600 mb-5 text-center">{result.message}</p>

              {/* Ações */}
              <div className="space-y-3">
                {result.billingPortalUrl && (
                  <a
                    href={result.billingPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-center transition"
                  >
                    💳 Regularizar pagamento
                  </a>
                )}

                {(result.subscriptionStatus === 'TRIAL' || result.subscriptionStatus === 'PAST_DUE') && (
                  <Link
                    href="/planos"
                    className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-center transition"
                  >
                    📋 Ver planos disponíveis
                  </Link>
                )}

                {result.subscriptionStatus === 'ACTIVE' && (
                  <Link
                    href="/login"
                    className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-center transition"
                  >
                    Entrar na plataforma →
                  </Link>
                )}

                <Link
                  href="/login"
                  className="block w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-xl text-center transition text-sm"
                >
                  Voltar ao login
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center mt-6 text-slate-400 text-sm">
          Precisa de ajuda?{' '}
          <a href="mailto:suporte@visao360.com.br" className="text-blue-400 hover:text-blue-300">
            suporte@visao360.com.br
          </a>
        </p>
      </div>
    </div>
  );
}
