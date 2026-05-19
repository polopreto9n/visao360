import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '../../lib/auth';

interface BadgeProps {
  value: string;
  type?: 'status' | 'priority' | 'custom';
  className?: string;
}

export function Badge({ value, type = 'status', className = '' }: BadgeProps) {
  const colorMap = type === 'priority' ? PRIORITY_COLORS : STATUS_COLORS;
  const labelMap = type === 'priority' ? PRIORITY_LABELS : STATUS_LABELS;
  const color = colorMap[value] ?? 'bg-slate-100 text-slate-600';
  const label = labelMap[value] ?? value;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${color} ${className}`}>
      {label}
    </span>
  );
}
