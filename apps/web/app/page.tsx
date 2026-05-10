import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="text-center max-w-2xl mx-auto animate-fade-in">
        {/* Logo / Brand */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 mb-6 shadow-2xl">
            <span className="text-4xl font-black text-white">V</span>
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tight">
            Visão<span className="text-blue-400">360</span>
          </h1>
          <p className="text-blue-200 text-xl font-medium">Gestão Predial Inteligente</p>
        </div>

        {/* Description */}
        <p className="text-slate-300 text-lg mb-10 leading-relaxed">
          Plataforma SaaS completa para síndicos e administradoras.
          <br />
          Checklists digitais, ordens de serviço, auditoria de equipamentos
          <br />e dashboard gerencial em tempo real.
        </p>

        {/* Features */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { icon: '✅', label: 'Checklists Digitais' },
            { icon: '🔧', label: 'Ordens de Serviço' },
            { icon: '📊', label: 'Dashboard em Tempo Real' },
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

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/25 hover:scale-105"
          >
            Acessar Plataforma →
          </Link>
          <a
            href="http://localhost:3001/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 backdrop-blur-sm"
          >
            API Docs (Swagger)
          </a>
        </div>

        {/* Status badges */}
        <div className="mt-12 flex items-center justify-center gap-6 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            API: localhost:3001
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Web: localhost:3000
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            DB: PostgreSQL
          </span>
        </div>
      </div>
    </main>
  );
}
