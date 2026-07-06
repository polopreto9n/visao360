'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Link inválido. Solicite um novo link de redefinição.');
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Link inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
          Senha redefinida!
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Sua senha foi atualizada com sucesso. Redirecionando para o login...
        </p>
        <Link href="/login" className="inline-block mt-2 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          Ir para o login agora
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
          Redefinir senha
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Escolha uma nova senha para sua conta.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Nova senha
          </label>
          <input
            required
            type="password"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Confirmar nova senha
          </label>
          <input
            required
            type="password"
            className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            placeholder="Repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full py-3 rounded-xl font-semibold text-white text-sm disabled:opacity-60 transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? 'Salvando...' : 'Redefinir senha'}
        </button>
      </form>

      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link href="/login" style={{ color: 'var(--accent)' }}>← Voltar ao login</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="fluent-card p-8">
          <Suspense fallback={<div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Carregando...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
