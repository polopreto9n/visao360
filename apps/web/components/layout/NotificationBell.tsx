'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Building2, ClipboardCheck, TriangleAlert, Wrench } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/auth';

interface NotificationData {
  workOrderId?: string;
  incidentId?: string;
  checklistId?: string;
  assetId?: string;
  screen?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS = {
  WORK_ORDER_ASSIGNED: Wrench,
  CHECKLIST_DUE: ClipboardCheck,
  INCIDENT_OPENED: TriangleAlert,
  ASSET_ALERT: Building2,
  SYSTEM: Bell,
};

function getHref(type: string, data: NotificationData | null): string {
  switch (type) {
    case 'WORK_ORDER_ASSIGNED':
      return data?.workOrderId
        ? `/dashboard/work-orders/${data.workOrderId}`
        : '/dashboard/work-orders';
    case 'CHECKLIST_DUE':
      return '/dashboard/checklists';
    case 'INCIDENT_OPENED':
      return '/dashboard/incidents';
    case 'ASSET_ALERT':
      return '/dashboard/assets';
    default:
      return '/dashboard';
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const response = await api.get<{ count: number }>('/notifications/unread-count');
      setUnread(response.data.count);
    } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get<{ data: Notification[] }>('/notifications?limit=10');
      setNotifications(response.data.data);
    } catch (error) {
      console.error('Falha ao carregar notificacoes:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleOpen() {
    if (!open) void fetchNotifications();
    setOpen(!open);
  }

  function handleNotificationClick(notification: Notification) {
    // Atualização otimista — não bloqueia a navegação
    if (!notification.isRead) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnread((count) => Math.max(0, count - 1));
      api.patch(`/notifications/${notification.id}/read`).catch(() => {});
    }

    setOpen(false);
    router.push(getHref(notification.type, notification.data));
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnread(0);
    } catch {}
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={toggleOpen}
        className="fluent-control relative flex h-10 w-10 items-center justify-center rounded-2xl text-slate-600 transition-colors hover:text-blue-700"
        title="Notificações"
        aria-label="Abrir notificações"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-[0_6px_14px_rgba(239,68,68,0.3)]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fluent-surface absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-[20px]">
          <div className="flex items-center justify-between border-b border-blue-100/80 px-4 py-3">
            <h3 className="text-[13px] font-bold text-slate-950">Notificações</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-bold text-blue-700 transition-opacity hover:opacity-70"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
              </div>
            ) : loadError ? (
              <div className="px-4 py-6 text-center">
                <Bell className="mx-auto mb-2 text-blue-600" size={24} />
                <p className="text-[13px] font-semibold text-slate-700">
                  Não foi possível carregar as notificações agora.
                </p>
                <button
                  onClick={() => void fetchNotifications()}
                  className="mt-3 rounded-xl border border-blue-100 bg-white/75 px-3 py-1.5 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-50"
                >
                  Tentar novamente
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="mx-auto mb-2 text-blue-600" size={24} />
                <p className="text-[13px] text-slate-500">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type as keyof typeof TYPE_ICONS] ?? Bell;

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="flex w-full items-start gap-3 border-b border-blue-100/70 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-blue-50/60 active:bg-blue-100/60"
                    style={{ background: !notification.isRead ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] leading-tight text-slate-950 ${notification.isRead ? 'font-medium' : 'font-bold'}`}>
                        {notification.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{notification.body}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(notification.createdAt)}</p>
                    </div>
                    {!notification.isRead && (
                      <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-blue-100/80 px-4 py-2 text-center">
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] font-bold text-blue-700 transition-opacity hover:opacity-70"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
