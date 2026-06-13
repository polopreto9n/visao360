'use client';

import { useCallback, useEffect, useState } from 'react';
import { suppliersApi, Supplier } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { canManage, getUser, formatDate } from '../../../lib/auth';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (search) params.search = search;
      const res = await suppliersApi.list(params);
      setSuppliers(res.data.data);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(s: Supplier) {
    if (!confirm(`Desativar o fornecedor "${s.name}"?`)) return;
    try {
      await suppliersApi.remove(s.id);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao desativar');
    }
  }

  async function openDetails(s: Supplier) {
    try {
      const res = await suppliersApi.get(s.id);
      setViewing(res.data);
    } catch {
      setViewing(s);
    }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Fornecedores</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} fornecedores cadastrados</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="fluent-button fluent-button-primary h-11 px-4 text-sm">
            + Novo Fornecedor
          </button>
        )}
      </div>

      <div className="fluent-filter-bar">
        <input
          className="w-full max-w-md rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          placeholder="Buscar por nome ou categoria..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="fluent-card p-16 text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum fornecedor cadastrado</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Cadastre prestadores de serviço para vincular às ordens de serviço.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="fluent-card p-5 flex flex-col gap-3 cursor-pointer" onClick={() => openDetails(s)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{s.name}</h3>
                  {s.category && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.category}</p>}
                </div>
                <span className="fluent-badge bg-blue-50 text-blue-700">{s._count?.workOrders ?? 0} OS</span>
              </div>
              <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                {s.phone && <p>📞 {s.phone}</p>}
                {s.email && <p>✉️ {s.email}</p>}
              </div>
              {canCreate && (
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(s)}
                    className="fluent-button fluent-button-secondary h-9 flex-1 text-xs">
                    Editar
                  </button>
                  <button onClick={() => handleRemove(s)}
                    className="fluent-button fluent-button-ghost h-9 px-3 text-xs text-red-600 hover:!border-red-200 hover:!bg-red-50">
                    Desativar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo Fornecedor" size="md">
        <SupplierForm onSuccess={() => { setCreating(false); load(); }} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar — ${editing?.name ?? ''}`} size="md">
        {editing && <SupplierForm supplier={editing} onSuccess={() => { setEditing(null); load(); }} />}
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''} size="md">
        {viewing && (
          <div className="space-y-4">
            <div className="grid gap-2 text-xs sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
              {viewing.category && (
                <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Categoria</strong>
                  {viewing.category}
                </span>
              )}
              {viewing.phone && (
                <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Telefone</strong>
                  {viewing.phone}
                </span>
              )}
              {viewing.email && (
                <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>E-mail</strong>
                  {viewing.email}
                </span>
              )}
            </div>
            {viewing.notes && (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{viewing.notes}</p>
            )}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Últimas ordens de serviço</p>
              {(viewing.workOrders ?? []).length === 0 ? (
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Nenhuma OS vinculada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {(viewing.workOrders ?? []).map((wo) => (
                    <div key={wo.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-2)' }}>
                      <div className="min-w-0">
                        <span className="font-mono mr-2" style={{ color: 'var(--text-muted)' }}>{wo.code}</span>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{wo.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge value={wo.status} />
                        {wo.cost != null && <span style={{ color: 'var(--text-muted)' }}>R$ {wo.cost.toFixed(2)}</span>}
                        {wo.completedAt && <span style={{ color: 'var(--text-muted)' }}>{formatDate(wo.completedAt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SupplierForm({ supplier, onSuccess }: { supplier?: Supplier; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '', category: supplier?.category ?? '',
    phone: supplier?.phone ?? '', email: supplier?.email ?? '', notes: supplier?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        category: form.category || undefined, phone: form.phone || undefined,
        email: form.email || undefined, notes: form.notes || undefined,
      };
      if (supplier) await suppliersApi.update(supplier.id, payload);
      else await suppliersApi.create(payload);
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };
  const f = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Nome *</label>
        <input required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle} value={form.name} onChange={f('name')} placeholder="ex: Elevadores Atlas Ltda" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Categoria</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle} value={form.category} onChange={f('category')} placeholder="ex: Elevadores" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Telefone</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle} value={form.phone} onChange={f('phone')} placeholder="(11) 99999-9999" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>E-mail</label>
        <input type="email" className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle} value={form.email} onChange={f('email')} placeholder="contato@fornecedor.com" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Observações</label>
        <textarea rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle} value={form.notes} onChange={f('notes')} placeholder="Informações adicionais..." />
      </div>
      <button type="submit" disabled={saving}
        className="fluent-button fluent-button-primary h-12 w-full text-sm">
        {saving ? 'Salvando...' : supplier ? 'Salvar alterações' : 'Criar Fornecedor'}
      </button>
    </form>
  );
}
