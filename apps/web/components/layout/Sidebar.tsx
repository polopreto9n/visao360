'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ClipboardList, CheckSquare, Wrench,
  AlertTriangle, Building2, Users, CreditCard, User,
  LogOut, ChevronRight,
} from 'lucide-react';
import { clearSession, getUser, ROLE_LABELS, canManage, canAdmin } from '../../lib/auth';
import { useTheme, THEME_LABELS, type Theme } from '../../lib/theme';

const NAV = [
  { href: '/dashboard',              label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/dashboard/work-orders',  label: 'Ordens de Serviço',icon: Wrench },
  { href: '/dashboard/checklists',   label: 'Checklists',       icon: CheckSquare },
  { href: '/dashboard/assets',       label: 'Equipamentos',     icon: Building2 },
  { href: '/dashboard/incidents',    label: 'Ocorrências',      icon: AlertTriangle },
  { href: '/dashboard/units',        label: 'Condomínios',      icon: ClipboardList, manageOnly: true },
  { href: '/dashboard/users',        label: 'Usuários',         icon: Users,         manageOnly: true },
  { href: '/dashboard/conta',        label: 'Assinatura',       icon: CreditCard,    adminOnly: true },
  { href: '/dashboard/profile',      label: 'Meu Perfil',       icon: User },
];

const THEMES: Theme[] = ['corporate', 'dark', 'glass'];

export function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const { theme, setTheme } = useTheme();

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const filtered = NAV.filter((n) => {
    if ((n as { manageOnly?: boolean }).manageOnly && !canManage(user?.role ?? '')) return false;
    if ((n as { adminOnly?: boolean }).adminOnly && !canAdmin(user?.role ?? '')) return false;
    return true;
  });

  return (
    <aside
      className={`flex flex-col h-full sidebar-transition ${mobile ? 'w-64' : 'w-60 fixed inset-y-0 left-0 z-30'}`}
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center gap-3 px-5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent)' }}>
          <span className="text-xs font-black text-white tracking-tight">V</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white leading-none tracking-tight">Visão360</p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--sidebar-text)' }}>
            {user?.company.name}
          </p>
        </div>
        {mobile && (
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md hover:opacity-70 transition-opacity"
            style={{ color: 'var(--sidebar-text)' }}>
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group relative"
              style={{
                background: active ? 'var(--sidebar-item-active)' : 'transparent',
                color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--sidebar-item)';
                  e.currentTarget.style.color = 'var(--sidebar-text-active)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--sidebar-text)';
                }
              }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--accent)' }} />
              )}
              <Icon size={15} strokeWidth={active ? 2.5 : 2} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={12} className="opacity-50" />}
            </Link>
          );
        })}

      </nav>

      {/* Theme Picker */}
      <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--sidebar-text)' }}>Tema</p>
        <div className="flex gap-1.5">
          {THEMES.map((t) => (
            <button key={t} onClick={() => setTheme(t)} title={THEME_LABELS[t].name}
              className="flex-1 h-5 rounded transition-all duration-150 border-2"
              style={{ background: THEME_LABELS[t].preview, borderColor: theme === t ? 'var(--accent)' : 'transparent', opacity: theme === t ? 1 : 0.4 }}
            />
          ))}
        </div>
      </div>

      {/* User */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg" style={{ background: 'var(--sidebar-item)' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
            style={{ background: 'var(--accent)' }}>
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-white truncate leading-tight">{user?.name}</p>
            <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--sidebar-text)' }}>
              {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
            </p>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="w-6 h-6 flex items-center justify-center rounded-md transition-opacity hover:opacity-70"
            style={{ color: 'var(--sidebar-text)' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
