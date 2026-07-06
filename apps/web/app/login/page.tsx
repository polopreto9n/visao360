'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Company {
  id: string;
  name: string;
  logoUrl: string | null;
}

type Step = 'email' | 'company' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  async function handleFindCompanies(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/auth/find-companies?email=${encodeURIComponent(email)}`);
      const data: Company[] = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setError('Nenhuma empresa encontrada para este e-mail.');
        return;
      }

      setCompanies(data);

      if (data.length === 1) {
        setSelectedCompany(data[0]);
        setStep('password');
      } else {
        setStep('company');
      }
    } catch {
      setError('Erro ao conectar com o servidor. Verifique se a API está rodando.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyId: selectedCompany.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? 'Credenciais inválidas');
        return;
      }

      localStorage.setItem('visao360_token', data.accessToken);
      localStorage.setItem('visao360_user', JSON.stringify(data.user));
      if (data.refreshToken) localStorage.setItem('visao360_refresh', data.refreshToken);
      router.push('/dashboard');
    } catch {
      setError('Erro ao entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
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
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          {step === 'email' && (
            <>
              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Bem-vindo de volta</h2>
              <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Informe seu e-mail para continuar</p>

              <form onSubmit={handleFindCompanies} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    required
                    className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
                  className="fluent-button fluent-button-primary h-12 w-full text-sm"
                >
                  {loading ? 'Buscando...' : 'Continuar →'}
                </button>
              </form>
            </>
          )}

          {step === 'company' && (
            <>
              <button
                onClick={() => setStep('email')}
                className="text-sm mb-4 flex items-center gap-1 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                ← Voltar
              </button>
              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Selecione a empresa</h2>
              <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                {email} está em {companies.length} empresa(s)
              </p>

              <div className="space-y-3">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => {
                      setSelectedCompany(company);
                      setStep('password');
                    }}
                    className="w-full flex items-center gap-4 p-4 border-2 rounded-xl transition text-left group hover:border-blue-500"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 font-bold text-lg">
                        {company.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold group-hover:text-blue-700" style={{ color: 'var(--text-primary)' }}>
                        {company.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{company.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'password' && selectedCompany && (
            <>
              <button
                onClick={() => setStep(companies.length > 1 ? 'company' : 'email')}
                className="text-sm mb-4 flex items-center gap-1 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                ← Voltar
              </button>
              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Entrar</h2>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-xs">
                    {selectedCompany.name.charAt(0)}
                  </span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selectedCompany.name}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full px-4 py-3 rounded-xl"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs" style={{ color: 'var(--accent)' }}>
                    Esqueceu a senha?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="fluent-button fluent-button-primary h-12 w-full text-sm"
                >
                  {loading ? 'Entrando...' : 'Entrar na plataforma'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Criar conta */}
        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Não tem uma conta?{' '}
          <Link href="/cadastro" className="text-blue-500 hover:text-blue-400 font-medium">
            Criar grátis com 14 dias de avaliação
          </Link>
        </p>

        {/* Dev hint */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-4 rounded-xl p-4 text-xs border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <strong>🔑 Credenciais de desenvolvimento:</strong>
            <br />
            admin@visao360.com.br / admin@123
            <br />
            tecnico@visao360.com.br / tecnico@123
          </div>
        )}
      </div>
    </div>
  );
}
