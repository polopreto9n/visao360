import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  padding?: 'sm' | 'md' | 'lg';
}

const pads = { sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, className = '', hover = false, onClick, padding = 'md' }: CardProps) {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${pads[padding]} ${hover ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        if (hover) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (hover) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
