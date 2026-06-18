'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { subscriptionsApi } from '../../../lib/api';

type State = 'polling' | 'active' | 'timeout' | 'unauthenticated';

export default function PlanosSuccessPage() {
  const [state, setState] = useState<State>('polling');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('visao360_token') : null;
    if (!token) {
      setState('unauthenticated');
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 10; // 10 × 3s = 30s

    const check = async () => {
      try {
        const res = await subscriptionsApi.status();
        if (res.data.subscriptionStatus === 'ACTIVE') {
          setState('active');
          return;
        }
      } catch {
        // ignora erros de rede durante polling
      }

      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        setState('timeout');
      }
    };

    // Checa imediatamente e depois a cada 3 segundos
    check();
    const interval = setInterval(() => {
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      check();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-xl font-black text-white">V</span>
            </div>
            <span className="text-xl font-black text-white">
              Visão<span className="text-blue-400">360</span>
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-8 text-center shadow-2xl">
          {state === 'polling' && (
            <>
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirmando pagamento</h1>
              <p className="text-gray-500 text-sm">
                Aguarde enquanto confirmamos sua assinatura com o Stripe. Isso pode levar alguns segundos.
              </p>
            </>
          )}

          {state === 'active' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Assinatura ativa!</h1>
              <p className="text-gray-500 text-sm mb-6">
                Seu pagamento foi confirmado. Bem-vindo ao Visão360!
              </p>
              <Link
                href="/dashboard"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
              >
                Ir para o dashboard →
              </Link>
            </>
          )}

          {state === 'timeout' && (
            <>
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagamento recebido</h1>
              <p className="text-gray-500 text-sm mb-6">
                Seu pagamento foi processado pelo Stripe. A ativação pode demorar alguns minutos —
                acesse o dashboard e atualize a página em instantes.
              </p>
              <Link
                href="/dashboard"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition mb-3"
              >
                Ir para o dashboard
              </Link>
              <Link href="/dashboard/conta" className="text-sm text-blue-600 hover:underline">
                Ver status da assinatura
              </Link>
            </>
          )}

          {state === 'unauthenticated' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagamento concluído!</h1>
              <p className="text-gray-500 text-sm mb-6">
                Sua assinatura foi ativada. Faça login para acessar o dashboard.
              </p>
              <Link
                href="/login"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
              >
                Fazer login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
