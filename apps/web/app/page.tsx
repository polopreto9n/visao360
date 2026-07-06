import Link from 'next/link';

const FEATURES = [
  { icon: '✅', title: 'Checklists Digitais', desc: 'Inspeções e rotinas preventivas com agendamento automático e histórico completo.' },
  { icon: '🔧', title: 'Ordens de Serviço', desc: 'Abra, acompanhe e finalize chamados em tempo real. Técnicos notificados automaticamente.' },
  { icon: '📊', title: 'Painel Gerencial', desc: 'KPIs de manutenção, custos e performance do condomínio em um só lugar.' },
  { icon: '📱', title: 'App para Técnicos', desc: 'Aplicativo móvel para execução de checklists e ordens de serviço em campo.' },
  { icon: '🏢', title: 'Gestão de Equipamentos', desc: 'Cadastro completo com QR Code, histórico de manutenções e alertas de vencimento.' },
  { icon: '🔔', title: 'Notificações', desc: 'Alertas em tempo real para síndicos, gestores e técnicos. Nada passa despercebido.' },
];

const BENEFITS = [
  { value: '14 dias', label: 'grátis para testar, sem cartão' },
  { value: 'App', label: 'móvel incluído no plano' },
  { value: '100%', label: 'baseado em nuvem, acesse de qualquer lugar' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-lg">V</span>
          </div>
          <span className="text-white font-bold text-lg">Visão<span style={{ color: '#60a5fa' }}>360</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/planos" style={{ color: '#94a3b8' }}
            className="text-sm font-medium hover:text-white transition hidden sm:inline">
            Planos
          </Link>
          <Link href="/login"
            className="text-sm font-semibold px-4 py-2 rounded-lg border transition"
            style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'white', background: 'rgba(255,255,255,0.08)' }}>
            Entrar
          </Link>
          <Link href="/cadastro"
            className="text-sm font-semibold px-4 py-2 rounded-lg transition"
            style={{ background: '#2563eb', color: 'white' }}>
            Criar conta grátis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 pt-16 pb-20 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-sm font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }}>
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          14 dias grátis · Sem cartão de crédito
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6">
          Gestão predial que{' '}
          <span style={{ color: '#60a5fa' }}>síndicos</span>{' '}
          e administradoras amam
        </h1>

        <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: '#94a3b8' }}>
          Organize manutenções, checklists e ocorrências do seu condomínio em um único sistema.
          Equipe em campo, gestores e síndico sempre alinhados.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link href="/cadastro"
            className="px-8 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg"
            style={{ background: '#2563eb', color: 'white', boxShadow: '0 8px 32px rgba(37,99,235,0.4)' }}>
            Começar agora — é grátis →
          </Link>
          <Link href="/login"
            className="px-8 py-4 rounded-xl font-semibold text-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
            Já tenho uma conta
          </Link>
        </div>

        {/* Social proof numbers */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
          {BENEFITS.map((b) => (
            <div key={b.value} className="text-center">
              <p className="text-2xl font-black" style={{ color: '#60a5fa' }}>{b.value}</p>
              <p className="text-sm" style={{ color: '#64748b' }}>{b.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20 max-w-6xl mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-white mb-12">
          Tudo que você precisa para gerir seu condomínio
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title}
              className="rounded-2xl p-6 transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-bold mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="px-6 pb-20 max-w-3xl mx-auto text-center">
        <div className="rounded-2xl p-10"
          style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)' }}>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Pronto para transformar a gestão do seu condomínio?
          </h2>
          <p className="mb-8" style={{ color: '#94a3b8' }}>
            Comece grátis hoje. Configure em minutos, sem necessidade de treinamento técnico.
          </p>
          <Link href="/cadastro"
            className="inline-block px-10 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105"
            style={{ background: '#2563eb', color: 'white' }}>
            Criar minha conta grátis
          </Link>
          <p className="mt-4 text-sm" style={{ color: '#475569' }}>
            14 dias de avaliação gratuita · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
        style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#475569' }}>
        <span>© {new Date().getFullYear()} Visão360 — Gestão Predial</span>
        <div className="flex gap-6">
          <Link href="/planos" className="hover:text-white transition">Planos</Link>
          <Link href="/login" className="hover:text-white transition">Entrar</Link>
          <Link href="/recuperar" className="hover:text-white transition">Recuperar acesso</Link>
        </div>
      </footer>
    </main>
  );
}
