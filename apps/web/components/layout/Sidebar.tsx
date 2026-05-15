'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { clearSession, getUser, ROLE_LABELS, canManage, canAdmin } from '../../lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/work-orders', label: 'Ordens de Serviço', icon: '🔧' },
  { href: '/dashboard/checklists', label: 'Checklists', icon: '✅' },
  { href: '/dashboard/assets', label: 'Equipamentos', icon: '🏗️' },
  { href: '/dashboard/incidents', label: 'Ocorrências', icon: '⚠️' },
  { href: '/dashboard/units', label: 'Condomínios', icon: '🏢', manageOnly: true },
  { href: '/dashboard/users', label: 'Usuários', icon: '👥', manageOnly: true },
  { href: '/dashboard/conta', label: 'Assinatura', icon: '💳', adminOnly: true },
  { href: '/dashboard/profile', label: 'Meu Perfil', icon: '👤' },
];

export function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const base = mobile
    ? 'w-64 bg-slate-900 text-white h-full flex flex-col'
    : 'flex w-56 bg-slate-900 text-white flex-col fixed inset-y-0 left-0 z-30';

  return (
    <aside className={base}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="font-black text-white">V</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white leading-none">Visão360</p>
          <p className="text-xs text-slate-400 truncate">{user?.company.name}</p>
        </div>
        {mobile && (
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white text-xl">×</button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.filter((n) => {
        if (n.manageOnly && !canManage(user?.role ?? '')) return false;
        if ((n as { adminOnly?: boolean }).adminOnly && !canAdmin(user?.role ?? '')) return false;
        return true;
      }).map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-white">{user?.name.charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full text-sm text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors text-left"
        >
          ↩ Sair da conta
        </button>
      </div>
    </aside>
  );
}
