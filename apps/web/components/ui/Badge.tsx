import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '../../lib/auth';

interface BadgeProps {
  value: string;
  type?: 'status' | 'priority' | 'custom';
  className?: string;
}

export function Badge({ value, type = 'status', className = '' }: BadgeProps) {
  const colorMap = type === 'priority' ? PRIORITY_COLORS : STATUS_COLORS;
  const labelMap = type === 'priority' ? PRIORITY_LABELS : STATUS_LABELS;
  const color = colorMap[value] ?? 'bg-gray-100 text-gray-700';
  const label = labelMap[value] ?? value;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${color} ${className}`}>
      {label}
    </span>
  );
}
