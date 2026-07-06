'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-md text-center space-y-4">
          <div className="text-5xl mb-4">✉️</div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Verifique seu e-mail
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Se <strong>{email}</strong> estiver cadastrado no Visão360, você receberá
            as instruções para redefinir sua senha em breve.
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link href="/login"
            className="inline-block mt-4 text-sm font-semibold"
            style={{ color: 'var(--accent)' }}>
            ← Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="fluent-card p-8 space-y-6">
          <div>
            <Link href="/login" className="text-sm mb-4 inline-block" style={{ color: 'var(--text-muted)' }}>
              ← Voltar ao login
            </Link>
            <h1 className="text-2xl font-extrabold mt-2" style={{ color: 'var(--text-primary)' }}>
              Esqueceu a senha?
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Informe seu e-mail e enviaremos um link para redefinição.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                E-mail
              </label>
              <input
                required
                type="email"
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={inputStyle}
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm disabled:opacity-60 transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Enviando...' : 'Enviar instruções'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
