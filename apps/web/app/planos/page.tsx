'use client';

import Link from 'next/link';

const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 'R$ 149',
    period: '/mês',
    description: 'Ideal para síndicos independentes com poucos condomínios.',
    color: 'border-gray-200',
    badge: '',
    features: [
      'Até 3 condomínios (unidades)',
      'Até 15 usuários',
      'Ordens de serviço ilimitadas',
      'Checklists ilimitados',
      'QR Code por equipamento',
      'Dashboard em tempo real',
      'Notificações push (mobile)',
      'Suporte por e-mail',
    ],
    cta: 'Começar com Starter',
    ctaClass: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white',
  },
  {
    id: 'PROFESSIONAL',
    name: 'Profissional',
    price: 'R$ 349',
    period: '/mês',
    description: 'Para administradoras com múltiplos condomínios e equipes.',
    color: 'border-blue-600 ring-2 ring-blue-600',
    badge: 'Mais popular',
    features: [
      'Até 15 condomínios (unidades)',
      'Até 60 usuários',
      'Tudo do Starter',
      'Relatórios avançados',
      'Agendamento de checklists',
      'Alertas de manutenção automáticos',
      'Histórico completo de auditoria',
      'Suporte prioritário',
    ],
    cta: 'Começar com Profissional',
    ctaClass: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'R$ 799',
    period: '/mês',
    description: 'Para grandes administradoras com demandas complexas.',
    color: 'border-gray-200',
    badge: '',
    features: [
      'Condomínios ilimitados',
      'Usuários ilimitados',
      'Tudo do Profissional',
      'API própria (white-label)',
      'SLA garantido de 99,9%',
      'Integração com sistemas legados',
      'Treinamento da equipe',
      'Gerente de conta dedicado',
    ],
    cta: 'Falar com vendas',
    ctaClass: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50',
  },
];

export default function PlanosPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 py-16">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <Link href="/" className="inline-flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-xl font-black text-white">V</span>
            </div>
            <span className="text-xl font-black text-white">
              Visão<span className="text-blue-400">360</span>
            </span>
          </Link>
          <h1 className="text-4xl font-black text-white mb-4">
            Escolha seu plano
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Comece com 14 dias grátis. Cancele quando quiser. Sem fidelidade.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 text-sm font-medium">
              Trial gratuito de 14 dias — sem cartão de crédito
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-7 border-2 ${plan.color} relative flex flex-col`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <p className="text-gray-500 text-sm mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-black text-gray-900">{plan.price}</span>
                <span className="text-gray-400 text-sm">{plan.period}</span>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/cadastro"
                className={`block w-full font-semibold py-3 rounded-xl text-center transition ${plan.ctaClass}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ rápido */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <h3 className="text-white font-bold text-lg mb-2">
            Todas as contas começam com trial gratuito de 14 dias
          </h3>
          <p className="text-slate-400 text-sm mb-6">
            Nenhum cartão de crédito necessário. Você escolhe o plano somente quando o trial encerrar.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
            <span>✅ Cancele quando quiser</span>
            <span>✅ Suporte incluso</span>
            <span>✅ Dados exportáveis</span>
          </div>
        </div>

        <p className="text-center mt-8 text-slate-500 text-sm">
          Já tem uma conta?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
