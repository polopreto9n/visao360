import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '../../lib/auth';

interface BadgeProps {
  value: string;
  type?: 'status' | 'priority' | 'custom';
  className?: string;
}

export function Badge({ value, type = 'status', className = '' }: BadgeProps) {
  const colorMap = type === 'priority' ? PRIORITY_COLORS : type === 'status' ? STATUS_COLORS : {};
  const labelMap = type === 'priority' ? PRIORITY_LABELS : type === 'status' ? STATUS_LABELS : {};
  const color = colorMap[value] ?? 'bg-slate-100 text-slate-600';
  const label = labelMap[value] ?? value;

  return (
    <span className={`fluent-badge ${color} ${className}`}>
      {label}
    </span>
  );
}
