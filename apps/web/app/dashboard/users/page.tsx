'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { usersApi, User } from '../../../lib/api';
import { formatDateTime, ROLE_LABELS, canAdmin, getUser } from '../../../lib/auth';

const ROLE_FILTER = ['', 'OWNER', 'ADMIN', 'GESTOR', 'TECNICO', 'CLIENTE'];

function getUsersLoadMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return 'Não foi possível carregar os usuários agora. Tente novamente.';
  }

  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'A consulta de usuários demorou demais. Tente novamente.'
      : 'Não foi possível conectar ao serviço de usuários. Verifique sua conexão e tente novamente.';
  }

  if (error.response.status === 401) {
    return 'Sua sessão expirou. Entre novamente para continuar.';
  }

  if (error.response.status === 403) {
    return 'Seu perfil não tem permissão para consultar usuários.';
  }

  if (error.response.status >= 500) {
    return 'O serviço de usuários está temporariamente indisponível. Tente novamente em instantes.';
  }

  return 'Não foi possível carregar os usuários agora. Tente novamente.';
}

function logUsersLoadError(error: unknown, params: Record<string, unknown>) {
  const debugParams = {
    page: params.page,
    limit: params.limit,
    role: params.role,
    hasSearch: Boolean(params.search),
  };

  if (axios.isAxiosError(error)) {
    console.error('[Usuarios] Falha ao carregar a lista.', {
      code: error.code,
      status: error.response?.status,
      method: error.config?.method,
      url: error.config?.url,
      params: debugParams,
    }, error);
    return;
  }

  console.error('[Usuarios] Falha inesperada ao carregar a lista.', { params: debugParams }, error);
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const user = getUser();
  const isAdmin = canAdmin(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params: Record<string, unknown> = { page, limit: 20 };
    if (search) params.search = search;
    if (roleFilter) params.role = roleFilter;

    try {
      const res = await usersApi.list(params);
      setUsers(res.data.data);
      setTotal(res.data.total);
    } catch (loadError) {
      logUsersLoadError(loadError, params);
      setUsers([]);
      setTotal(0);
      setError(getUsersLoadMessage(loadError));
    } finally { setLoading(false); }
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const ROLE_COLORS: Record<string, string> = {
    OWNER: 'bg-indigo-100 text-indigo-800',
    ADMIN: 'bg-purple-100 text-purple-800',
    GESTOR: 'bg-blue-100 text-blue-800',
    TECNICO: 'bg-amber-100 text-amber-800',
    CLIENTE: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Usuários</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} usuários cadastrados</p>
      </div>

      {/* Filtros */}
      <div className="fluent-filter-bar flex-col sm:flex-row">
        <input
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          placeholder="Buscar por nome ou e-mail..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-1">
          {ROLE_FILTER.map((r) => (
            <button key={r} onClick={() => { setRoleFilter(r); setPage(1); }}
              className={`fluent-filter-chip ${roleFilter === r ? 'fluent-filter-chip-active' : ''}`}>
              {r ? ROLE_LABELS[r] : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {error && !loading ? (
        <div
          className="fluent-card flex flex-col items-center gap-4 px-6 py-12 text-center"
          role="alert"
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#b91c1c' }}
          >
            !
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Não foi possível abrir Usuários
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="fluent-button fluent-button-secondary h-11 px-4 text-sm"
          >
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['Usuário', 'Perfil', 'Telefone', 'Último login', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${ROLE_COLORS[u.role] ?? 'bg-gray-100'}`}>
                          <span className="text-sm font-bold">{u.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.id === user?.id ? '(você) ' : ''}{u.role === 'ADMIN' ? '⚙️ ' : ''}{u.email ?? ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{u.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{formatDateTime(u.lastLoginAt)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Nenhum usuário encontrado</div>
          )}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              ← Anterior
            </button>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
