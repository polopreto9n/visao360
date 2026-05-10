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
      setError('Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

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

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'email' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Bem-vindo de volta</h2>
              <p className="text-gray-500 mb-6">Informe seu e-mail para continuar</p>

              <form onSubmit={handleFindCompanies} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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

          {step === 'company' && (
            <>
              <button
                onClick={() => setStep('email')}
                className="text-gray-400 hover:text-gray-600 text-sm mb-4 flex items-center gap-1"
              >
                ← Voltar
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Selecione a empresa</h2>
              <p className="text-gray-500 mb-6 text-sm">
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
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl transition text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 font-bold text-lg">
                        {company.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 group-hover:text-blue-700">
                        {company.name}
                      </p>
                      <p className="text-xs text-gray-400">{company.id}</p>
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
                className="text-gray-400 hover:text-gray-600 text-sm mb-4 flex items-center gap-1"
              >
                ← Voltar
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h2>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-xs">
                    {selectedCompany.name.charAt(0)}
                  </span>
                </div>
                <p className="text-gray-500 text-sm">{selectedCompany.name}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500"
                  />
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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
                  {loading ? 'Entrando...' : 'Entrar na plataforma'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Dev hint */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-200">
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
