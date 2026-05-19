'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/auth';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  WORK_ORDER_ASSIGNED: '🔧',
  CHECKLIST_DUE: '📋',
  INCIDENT_OPENED: '⚠️',
  ASSET_ALERT: '🏗️',
  SYSTEM: '🔔',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get<{ count: number }>('/notifications/unread-count');
      setUnread(res.data.count);
    } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Notification[] }>('/notifications?limit=10');
      setNotifications(res.data.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleOpen() {
    if (!open) fetchNotifications();
    setOpen(!open);
  }

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
      setUnread((c) => Math.max(0, c - 1));
    } catch {}
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={toggleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Notificações"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-2xl z-50 overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Notificações</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent)' }}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: !n.isRead ? 'var(--accent-soft)' : 'transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = !n.isRead ? 'var(--accent-soft)' : 'transparent')}
                >
                  <span className="text-lg mt-0.5 flex-shrink-0">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] leading-tight font-medium" style={{ color: 'var(--text-primary)', fontWeight: !n.isRead ? 600 : 400 }}>
                      {n.title}
                    </p>
                    <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{n.body}</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <button onClick={() => markRead(n.id)} title="Marcar como lida"
                      className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5 hover:bg-blue-700 transition-colors" />
                  )}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 text-center" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setOpen(false)} className="text-[11px] font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--accent)' }}>
                Fechar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
