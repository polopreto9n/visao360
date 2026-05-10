import { AuthUser } from './api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('visao360_token');
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('visao360_user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function saveSession(token: string, user: AuthUser, refreshToken?: string): void {
  localStorage.setItem('visao360_token', token);
  localStorage.setItem('visao360_user', JSON.stringify(user));
  if (refreshToken) localStorage.setItem('visao360_refresh', refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem('visao360_token');
  localStorage.removeItem('visao360_refresh');
  localStorage.removeItem('visao360_user');
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  TECNICO: 'Técnico',
  CLIENTE: 'Cliente',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta', ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento',
  WAITING_PARTS: 'Aguard. peças', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', MAINTENANCE: 'Em manutenção', DECOMMISSIONED: 'Desativado',
  PENDING: 'Pendente',
  PREVENTIVE: 'Preventivo', CORRECTIVE: 'Corretivo', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica',
};

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  WAITING_PARTS: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-red-100 text-red-800',
};

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function canAdmin(role: string): boolean {
  return role === 'ADMIN';
}

export function canManage(role: string): boolean {
  return role === 'ADMIN' || role === 'GESTOR';
}
