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
        <h1 className="text-2xl font-extrabold text-gray-900">Usuários</h1>
        <p className="text-sm text-slate-500">{total} usuários cadastrados</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Buscar por nome ou e-mail..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-1">
          {ROLE_FILTER.map((r) => (
            <button key={r} onClick={() => { setRoleFilter(r); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                roleFilter === r ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {r ? ROLE_LABELS[r] : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Usuário', 'Role', 'Telefone', 'Último login', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${ROLE_COLORS[u.role] ?? 'bg-gray-100'}`}>
                          <span className="text-sm font-bold">{u.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                          <p className="text-xs text-slate-400">{u.id === user?.id ? '(você) ' : ''}{u.role === 'ADMIN' ? '⚙️ ' : ''}{u.email ?? ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{formatDateTime(u.lastLoginAt)}</td>
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
            <div className="text-center py-16 text-slate-400">Nenhum usuário encontrado</div>
          )}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
          </div>
        </div>
      )}
    </div>
  );
}
