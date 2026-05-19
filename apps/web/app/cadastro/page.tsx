'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '../../lib/api';
import { saveSession } from '../../lib/auth';

export default function CadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    companyName: '',
    companyEmail: '',
    ownerName: '',
    ownerEmail: '',
    password: '',
    confirmPassword: '',
    phone: '',
    cnpj: '',
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (form.password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.registerTenant({
        companyName: form.companyName.trim(),
        companyEmail: form.companyEmail.trim(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        cnpj: form.cnpj.trim() || undefined,
      });

      saveSession(res.data.accessToken, res.data.user, res.data.refreshToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string | string[]; statusCode?: number } } })
        ?.response?.data;
      if (data?.statusCode === 409) {
        setError('E-mail já cadastrado. Use outro e-mail ou faça login.');
      } else if (data?.statusCode === 403) {
        setError('Conta suspensa. Acesse /recuperar para regularizar.');
      } else if (Array.isArray(data?.message)) {
        setError(data.message[0] ?? 'Verifique os dados e tente novamente.');
      } else {
        setError(data?.message ?? 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm";
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: 'var(--accent)' }}>
              <span className="text-2xl font-black text-white">V</span>
            </div>
            <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              Visão<span className="text-blue-500">360</span>
            </span>
          </Link>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            14 dias grátis · Sem cartão de crédito
          </p>
        </div>

        <div className="rounded-2xl p-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Criar sua conta</h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            Comece seu trial gratuito de 14 dias agora mesmo.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Empresa */}
            <div className="pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-3">
                Dados da empresa
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Nome da empresa *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={set('companyName')}
                    placeholder="Ex: João Gestão Predial"
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      E-mail da empresa *
                    </label>
                    <input
                      type="email"
                      value={form.companyEmail}
                      onChange={set('companyEmail')}
                      placeholder="contato@empresa.com"
                      required
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      CNPJ (opcional)
                    </label>
                    <input
                      type="text"
                      value={form.cnpj}
                      onChange={set('cnpj')}
                      placeholder="00.000.000/0001-00"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Responsável */}
            <div>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-3">
                Seu acesso (proprietário)
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Seu nome *
                    </label>
                    <input
                      type="text"
                      value={form.ownerName}
                      onChange={set('ownerName')}
                      placeholder="João Silva"
                      required
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Telefone
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="(11) 99999-0001"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    E-mail de login *
                  </label>
                  <input
                    type="email"
                    value={form.ownerEmail}
                    onChange={set('ownerEmail')}
                    placeholder="voce@email.com"
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Senha *
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                      placeholder="Mín. 8 caracteres"
                      required
                      minLength={8}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Confirmar senha *
                    </label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={set('confirmPassword')}
                      placeholder="••••••••"
                      required
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition mt-2"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis →'}
            </button>

            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Ao criar uma conta você concorda com os nossos Termos de Uso.
            </p>
          </form>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Já tem uma conta?{' '}
          <Link href="/login" className="text-blue-500 hover:text-blue-400 font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
