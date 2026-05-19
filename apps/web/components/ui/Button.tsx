import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[12px] gap-1.5 rounded-lg',
  md: 'px-4 py-2.5 text-[13px] gap-2 rounded-xl',
  lg: 'px-5 py-3 text-[14px] gap-2 rounded-xl',
};

export function Button({
  variant = 'primary', size = 'md', loading = false,
  icon, children, disabled, className = '', style, ...props
}: ButtonProps) {
  const variantStyle: Record<Variant, React.CSSProperties> = {
    primary:   { background: 'var(--accent)', color: '#fff', border: '1px solid transparent' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    ghost:     { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
    danger:    { background: '#dc2626', color: '#fff', border: '1px solid transparent' },
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 whitespace-nowrap ${sizes[size]} ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      style={{ ...variantStyle[variant], ...style }}
      onMouseEnter={(e) => {
        if (disabled || loading) return;
        if (variant === 'primary') (e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)';
        if (variant === 'secondary') (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
        if (variant === 'ghost') (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (disabled || loading) return;
        Object.assign((e.currentTarget as HTMLElement).style, variantStyle[variant]);
        props.onMouseLeave?.(e);
      }}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon}
      {children}
    </button>
  );
}
