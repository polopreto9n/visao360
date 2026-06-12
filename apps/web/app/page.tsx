import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const SWAGGER_URL = API_URL.replace('/api/v1', '/api/docs');

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-2xl mx-auto animate-fade-in">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 mb-6 shadow-2xl">
            <span className="text-4xl font-black text-white">V</span>
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tight">
            Visão<span className="text-blue-400">360</span>
          </h1>
          <p className="text-blue-200 text-xl font-medium">Gestão Predial Inteligente</p>
        </div>

        {/* Selo da avaliacao */}
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400 text-sm font-medium">14 dias grátis · Sem cartão de crédito</span>
        </div>

        {/* Description */}
        <p className="text-slate-300 text-lg mb-10 leading-relaxed">
          Plataforma SaaS completa para síndicos e administradoras.
          <br />
          Checklists digitais, ordens de serviço, auditoria de equipamentos
          <br />e painel gerencial em tempo real.
        </p>

        {/* Features */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { icon: '✅', label: 'Checklists Digitais' },
            { icon: '🔧', label: 'Ordens de Serviço' },
            { icon: '📊', label: 'Painel em tempo real' },
            { icon: '📱', label: 'QR Code por Equipamento' },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm"
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-slate-300 text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>

        {/* CTAs principais */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
          <Link
            href="/cadastro"
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/25 hover:scale-105"
          >
            Criar conta grátis →
          </Link>
          <Link
            href="/login"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 backdrop-blur-sm"
          >
            Já tenho conta
          </Link>
        </div>

        {/* Links secundários */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <Link href="/planos" className="text-blue-400 hover:text-blue-300 text-sm font-medium transition">
            Ver planos e preços
          </Link>
          <span className="text-slate-600">·</span>
          <a
            href={SWAGGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-slate-300 text-sm transition"
          >
            Documentação da API
          </a>
          <span className="text-slate-600">·</span>
          <Link href="/recuperar" className="text-slate-400 hover:text-slate-300 text-sm transition">
            Recuperar acesso
          </Link>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            API Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            PostgreSQL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Redis
          </span>
        </div>
      </div>
    </main>
  );
}
