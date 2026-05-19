'use client';

import { useCallback, useEffect, useState } from 'react';
import { usersApi, User } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { formatDate, formatDateTime, ROLE_LABELS, canAdmin, getUser } from '../../../lib/auth';

const ROLE_FILTER = ['', 'ADMIN', 'GESTOR', 'TECNICO', 'CLIENTE'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const user = getUser();
  const isAdmin = canAdmin(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await usersApi.list(params);
      setUsers(res.data.data);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const ROLE_COLORS: Record<string, string> = {
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
      <div className="rounded-xl border p-4 flex flex-col sm:flex-row gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <input
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          placeholder="Buscar por nome ou e-mail..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-1">
          {ROLE_FILTER.map((r) => (
            <button key={r} onClick={() => { setRoleFilter(r); setPage(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
              style={
                roleFilter === r
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--text-secondary)' }
              }>
              {r ? ROLE_LABELS[r] : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['Usuário', 'Role', 'Telefone', 'Último login', 'Status'].map((h) => (
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
