export type ScheduleStatus =
  | 'BLOCKED'
  | 'AVAILABLE'
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'EXPIRED'
  | 'NO_SCHEDULE';

export interface ScheduleStatusResult {
  status: ScheduleStatus;
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  canExecute: boolean;
  daysToRelease: number | null;
  daysToDue: number | null;
  daysOverdue: number | null;
  releaseDate: Date | null;
  dueDate: Date | null;
  expirationDate: Date | null;
  cycleProgressPct: number;
}

interface ScheduleInput {
  nextDueAt: string;
  repeatDays?: number | null;
  releaseBeforeDays?: number | null;
  toleranceDays?: number | null;
}

export function getScheduleStatus(schedule: ScheduleInput): ScheduleStatusResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(schedule.nextDueAt);
  dueDate.setHours(0, 0, 0, 0);

  const releaseBeforeDays = schedule.releaseBeforeDays ?? 3;
  const toleranceDays = schedule.toleranceDays ?? 2;
  const repeatDays = schedule.repeatDays ?? 30;

  const releaseDate = new Date(dueDate);
  releaseDate.setDate(releaseDate.getDate() - releaseBeforeDays);

  const expirationDate = new Date(dueDate);
  expirationDate.setDate(expirationDate.getDate() + toleranceDays);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilRelease = Math.ceil((releaseDate.getTime() - today.getTime()) / msPerDay);
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / msPerDay);
  const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / msPerDay);

  const daysSinceStart = repeatDays - daysUntilDue;
  const cycleProgressPct = Math.min(100, Math.max(0, (daysSinceStart / repeatDays) * 100));

  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const base = { releaseDate, dueDate, expirationDate, cycleProgressPct };

  // BLOQUEADO
  if (today < releaseDate) {
    const d = daysUntilRelease;
    return {
      ...base,
      status: 'BLOCKED',
      label: `Libera em ${d} dia${d !== 1 ? 's' : ''}`,
      sublabel: `Disponível a partir de ${fmt(releaseDate)}`,
      color: '#6b7280',
      bgColor: '#f9fafb',
      borderColor: '#e5e7eb',
      iconColor: '#9ca3af',
      canExecute: false,
      daysToRelease: d,
      daysToDue: daysUntilDue,
      daysOverdue: null,
    };
  }

  // DISPONÍVEL — vence em breve (≤ 2 dias)
  if (today <= dueDate && daysUntilDue <= 2) {
    const label = daysUntilDue === 0 ? 'Vence hoje!' : `Vence em ${daysUntilDue} dia${daysUntilDue !== 1 ? 's' : ''}`;
    return {
      ...base,
      status: 'DUE_SOON',
      label,
      sublabel: `Liberado desde ${fmt(releaseDate)} · Vence ${fmt(dueDate)}`,
      color: '#b45309',
      bgColor: '#fffbeb',
      borderColor: '#fcd34d',
      iconColor: '#d97706',
      canExecute: true,
      daysToRelease: null,
      daysToDue: daysUntilDue,
      daysOverdue: null,
    };
  }

  // DISPONÍVEL — normal
  if (today <= dueDate) {
    return {
      ...base,
      status: 'AVAILABLE',
      label: 'Disponível',
      sublabel: `Vence em ${daysUntilDue} dia${daysUntilDue !== 1 ? 's' : ''} — ${fmt(dueDate)}`,
      color: '#15803d',
      bgColor: '#f0fdf4',
      borderColor: '#86efac',
      iconColor: '#16a34a',
      canExecute: true,
      daysToRelease: null,
      daysToDue: daysUntilDue,
      daysOverdue: null,
    };
  }

  // ATRASADO (dentro da tolerância)
  if (daysUntilExpiry > 0) {
    const daysOverdue = -daysUntilDue;
    return {
      ...base,
      status: 'OVERDUE',
      label: `Atrasado há ${daysOverdue} dia${daysOverdue !== 1 ? 's' : ''}`,
      sublabel: `Venceu em ${fmt(dueDate)} · Expira em ${fmt(expirationDate)}`,
      color: '#b91c1c',
      bgColor: '#fff1f2',
      borderColor: '#fca5a5',
      iconColor: '#dc2626',
      canExecute: true,
      daysToRelease: null,
      daysToDue: null,
      daysOverdue,
    };
  }

  // EXPIRADO
  const daysOverdue = -daysUntilDue;
  return {
    ...base,
    status: 'EXPIRED',
    label: 'Expirado',
    sublabel: `Venceu em ${fmt(dueDate)} — prazo encerrado`,
    color: '#7c3aed',
    bgColor: '#faf5ff',
    borderColor: '#c4b5fd',
    iconColor: '#7c3aed',
    canExecute: false,
    daysToRelease: null,
    daysToDue: null,
    daysOverdue,
  };
}

export function noScheduleStatus(): ScheduleStatusResult {
  return {
    status: 'NO_SCHEDULE',
    label: 'Avulso',
    sublabel: 'Sem agenda definida',
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    iconColor: '#3b82f6',
    canExecute: true,
    daysToRelease: null,
    daysToDue: null,
    daysOverdue: null,
    releaseDate: null,
    dueDate: null,
    expirationDate: null,
    cycleProgressPct: 0,
  };
}
