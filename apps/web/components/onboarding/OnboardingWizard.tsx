'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Users,
  Wrench,
  X,
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  done: boolean;
}

interface OnboardingWizardProps {
  hasUnits: boolean;
  hasAssets: boolean;
  hasTeam: boolean;
  hasChecklists: boolean;
  onDismiss: () => void;
}

export function OnboardingWizard({ hasUnits, hasAssets, hasTeam, hasChecklists, onDismiss }: OnboardingWizardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const steps: Step[] = [
    {
      icon: <Building2 className="w-5 h-5" />,
      title: 'Cadastre sua primeira unidade',
      description: 'Unidades são os prédios, blocos ou condomínios que você gerencia.',
      action: (
        <Link href="/dashboard/units" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          Ir para Unidades <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
      done: hasUnits,
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: 'Adicione sua equipe',
      description: 'Convide técnicos e gestores para colaborar na plataforma.',
      action: (
        <Link href="/dashboard/team" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          Ir para Equipe <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
      done: hasTeam,
    },
    {
      icon: <Wrench className="w-5 h-5" />,
      title: 'Cadastre seus equipamentos',
      description: 'Cada equipamento pode ter checklists e histórico próprio com QR Code.',
      action: (
        <Link href="/dashboard/assets" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          Ir para Equipamentos <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
      done: hasAssets,
    },
    {
      icon: <ListChecks className="w-5 h-5" />,
      title: 'Crie seu primeiro checklist',
      description: 'Use nossos templates prontos (NR-10, NR-23, ABNT) ou crie do zero.',
      action: (
        <Link href="/dashboard/checklists?templates=1" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          Usar templates <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ),
      done: hasChecklists,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  if (allDone) return null;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-blue-200 bg-white/60">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Configure sua conta</p>
            <p className="text-xs text-slate-500">{completedCount} de {steps.length} etapas concluídas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {collapsed ? 'Expandir' : 'Minimizar'}
          </button>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-blue-100">
        <div
          className="h-1 bg-blue-600 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {!collapsed && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={`relative p-4 rounded-lg border transition-all ${
                step.done
                  ? 'bg-green-50 border-green-200 opacity-70'
                  : 'bg-white border-blue-200 shadow-sm'
              }`}
            >
              {step.done && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
              )}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${
                step.done ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {step.icon}
              </div>
              <p className={`text-sm font-semibold mb-1 ${step.done ? 'text-green-800 line-through' : 'text-slate-900'}`}>
                {step.title}
              </p>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">{step.description}</p>
              {!step.done && step.action}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
