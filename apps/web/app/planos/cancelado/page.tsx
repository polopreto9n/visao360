'use client';

import Link from 'next/link';

export default function PlanosCanceladoPage() {
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
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Checkout cancelado</h1>
          <p className="text-gray-500 text-sm mb-8">
            Nenhuma cobrança foi realizada. Você pode escolher um plano quando quiser.
          </p>

          <Link
            href="/planos"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition mb-3"
          >
            Ver planos
          </Link>
          <Link
            href="/dashboard"
            className="block w-full border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-3 rounded-xl transition"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
