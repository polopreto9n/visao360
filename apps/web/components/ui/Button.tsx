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
  sm: 'h-9 px-3 text-[12px]',
  md: 'h-11 px-4 text-[13px]',
  lg: 'h-12 px-5 text-[14px]',
};

export function Button({
  variant = 'primary', size = 'md', loading = false,
  icon, children, disabled, className = '', style, ...props
}: ButtonProps) {
  const variants: Record<Variant, string> = {
    primary: 'fluent-button-primary',
    secondary: 'fluent-button-secondary',
    ghost: 'fluent-button-ghost',
    danger: 'fluent-button-danger',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`fluent-button ${variants[variant]} ${sizes[size]} ${disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      style={style}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon}
      {children}
    </button>
  );
}
