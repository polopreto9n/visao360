'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BellRing,
  Building2,
  CheckSquare,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  SunMedium,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { canAdmin, canManage, clearSession, getUser, ROLE_LABELS } from '../../lib/auth';
import { THEME_LABELS, type Theme, useTheme } from '../../lib/theme';

const NAV = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/dashboard/alerts', label: 'Alertas', icon: BellRing },
  { href: '/dashboard/work-orders', label: 'Ordens de Serviço', icon: Wrench },
  { href: '/dashboard/checklists', label: 'Checklists', icon: CheckSquare },
  { href: '/dashboard/assets', label: 'Equipamentos', icon: Building2 },
  { href: '/dashboard/incidents', label: 'Ocorrências', icon: AlertTriangle },
  { href: '/dashboard/units', label: 'Condomínios', icon: ClipboardList, manageOnly: true },
  { href: '/dashboard/users', label: 'Usuários', icon: Users, manageOnly: true },
  { href: '/dashboard/conta', label: 'Assinatura', icon: CreditCard, adminOnly: true },
  { href: '/dashboard/profile', label: 'Meu perfil', icon: User },
];

const THEMES: Theme[] = ['corporate', 'dark', 'glass'];
const THEME_ICONS = { corporate: SunMedium, dark: MoonStar, glass: Sparkles };

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ mobile, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const { theme, setTheme } = useTheme();
  const compact = collapsed && !mobile;

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const filtered = NAV.filter((item) => {
    if ('manageOnly' in item && item.manageOnly && !canManage(user?.role ?? '')) return false;
    if ('adminOnly' in item && item.adminOnly && !canAdmin(user?.role ?? '')) return false;
    return true;
  });

  return (
    <aside
      className={`sidebar-transition flex h-full flex-col overflow-hidden border-r ${
        mobile ? 'w-[260px] rounded-r-[22px]' : `fixed inset-y-0 left-0 z-30 rounded-r-[22px] ${compact ? 'w-24' : 'w-[260px]'}`
      }`}
      style={{
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        boxShadow: '18px 0 46px rgba(37,99,235,0.08)',
      }}
    >
      <div
        className={`relative flex min-h-[86px] flex-shrink-0 items-center gap-3 border-b ${
          compact ? 'justify-center px-3' : 'px-5'
        }`}
        style={{ borderColor: 'rgba(220,232,247,0.82)' }}
      >
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)]"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
        >
          <Building2 size={20} strokeWidth={2.25} />
        </div>

        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-slate-900">Visão360</p>
            <p className="mt-1 truncate text-[11px] font-medium text-slate-500">Gestão Predial</p>
          </div>
        )}

        {mobile ? (
          <button
            onClick={onClose}
            className="fluent-control flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:text-blue-700"
            aria-label="Fechar menu"
          >
            <X size={15} />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className={`fluent-control hidden h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-colors hover:text-blue-700 lg:flex ${
              compact ? 'absolute right-3 top-7' : ''
            }`}
            aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
            title={compact ? 'Expandir menu' : 'Recolher menu'}
          >
            {compact ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        )}
      </div>

      <nav className={`scrollbar-hide flex-1 space-y-2 overflow-y-auto py-4 ${compact ? 'px-3' : 'px-4'}`}>
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={compact ? item.label : undefined}
              className={`group flex min-h-[48px] items-center rounded-2xl text-[13px] font-semibold transition-all duration-150 ${
                compact ? 'justify-center px-2' : 'gap-3 px-4'
              }`}
              style={{
                background: active ? 'var(--sidebar-item-active)' : 'transparent',
                color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
              }}
              onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = 'var(--sidebar-item)';
              }}
              onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.35 : 1.9} />
              {!compact && <span className="min-w-0 flex-1">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`flex-shrink-0 space-y-3 p-4 ${compact ? 'px-3' : ''}`}>
        <div className={`fluent-surface-soft flex items-center rounded-2xl ${compact ? 'justify-center p-2' : 'gap-3 p-3'}`}>
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #818CF8, #2563EB)' }}
          >
            {user?.name.charAt(0).toUpperCase()}
          </div>

          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold leading-tight text-slate-900">{user?.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">{user?.email}</p>
            </div>
          )}

          {!compact && (
            <button
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-blue-700"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>

        <div className={`fluent-surface-soft flex gap-1 rounded-2xl p-1.5 ${compact ? 'flex-col' : 'items-center'}`}>
          {THEMES.map((item) => {
            const ThemeIcon = THEME_ICONS[item];
            return (
              <button
                key={item}
                onClick={() => setTheme(item)}
                title={THEME_LABELS[item].name}
                aria-label={THEME_LABELS[item].name}
                className="flex h-9 flex-1 items-center justify-center rounded-xl border text-slate-600 transition-all hover:text-blue-700"
                style={{
                  background: theme === item ? 'rgba(255,255,255,0.92)' : 'transparent',
                  borderColor: theme === item ? 'rgba(220,232,247,0.95)' : 'transparent',
                  boxShadow: theme === item ? '0 8px 18px rgba(15,23,42,0.06)' : 'none',
                }}
              >
                <ThemeIcon size={15} />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
