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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
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
          <p className="text-slate-400 mt-3 text-sm">
            14 dias grátis · Sem cartão de crédito
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Criar sua conta</h2>
          <p className="text-gray-500 mb-6 text-sm">
            Comece seu trial gratuito de 14 dias agora mesmo.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Empresa */}
            <div className="pb-2 mb-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
                Dados da empresa
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da empresa *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={set('companyName')}
                    placeholder="Ex: João Gestão Predial"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mail da empresa *
                    </label>
                    <input
                      type="email"
                      value={form.companyEmail}
                      onChange={set('companyEmail')}
                      placeholder="contato@empresa.com"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ (opcional)
                    </label>
                    <input
                      type="text"
                      value={form.cnpj}
                      onChange={set('cnpj')}
                      placeholder="00.000.000/0001-00"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Responsável */}
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
                Seu acesso (proprietário)
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Seu nome *
                    </label>
                    <input
                      type="text"
                      value={form.ownerName}
                      onChange={set('ownerName')}
                      placeholder="João Silva"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="(11) 99999-0001"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail de login *
                  </label>
                  <input
                    type="email"
                    value={form.ownerEmail}
                    onChange={set('ownerEmail')}
                    placeholder="voce@email.com"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Senha *
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                      placeholder="Mín. 8 caracteres"
                      required
                      minLength={8}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar senha *
                    </label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={set('confirmPassword')}
                      placeholder="••••••••"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
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
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition mt-2"
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis →'}
            </button>

            <p className="text-xs text-center text-gray-400">
              Ao criar uma conta você concorda com os nossos Termos de Uso.
            </p>
          </form>
        </div>

        <p className="text-center mt-6 text-slate-400 text-sm">
          Já tem uma conta?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
