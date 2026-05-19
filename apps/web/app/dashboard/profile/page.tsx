'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { getUser, clearSession, ROLE_LABELS } from '../../../lib/auth';

export default function ProfilePage() {
  const user = getUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: user?.name ?? '', phone: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    api.get('/auth/me').then((r) => {
      const u = r.data as { name: string; phone: string | null };
      setForm({ name: u.name, phone: u.phone ?? '' });
    }).catch(() => {});
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await api.patch(`/users/${user?.id}`, { name: form.name, phone: form.phone || undefined });
      // Atualizar localStorage
      const stored = localStorage.getItem('visao360_user');
      if (stored) {
        const u = JSON.parse(stored);
        localStorage.setItem('visao360_user', JSON.stringify({ ...u, name: form.name }));
      }
      setMsg('✅ Perfil atualizado com sucesso!');
    } catch {
      setMsg('❌ Erro ao salvar. Tente novamente.');
    } finally { setSaving(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwMsg('❌ As senhas não coincidem'); return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwMsg('❌ A nova senha deve ter no mínimo 8 caracteres'); return;
    }
    setSavingPw(true); setPwMsg('');
    try {
      await api.patch('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg('✅ Senha alterada com sucesso!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setPwMsg(`❌ ${msg ?? 'Erro ao alterar senha'}`);
    } finally { setSavingPw(false); }
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!user) return null;

  const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
    ADMIN:   { label: 'Administrador', color: '#7c3aed', bg: '#ede9fe' },
    GESTOR:  { label: 'Gestor',         color: '#2563eb', bg: '#dbeafe' },
    TECNICO: { label: 'Técnico',         color: '#d97706', bg: '#fef3c7' },
    CLIENTE: { label: 'Cliente',         color: '#16a34a', bg: '#dcfce7' },
  };
  const rc = roleConfig[user.role] ?? roleConfig.TECNICO;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Meu Perfil</h1>

      {/* Avatar + info */}
      <div className="rounded-xl border p-6 flex items-center gap-5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
          <span className="text-3xl font-black text-white">{user.name.charAt(0)}</span>
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
          <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: rc.bg, color: rc.color }}>
            {rc.label}
          </span>
        </div>
      </div>

      {/* Editar dados */}
      <div className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Dados pessoais</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Nome *</label>
            <input required
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Telefone</label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="(11) 99999-0000" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
            <input disabled
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              value={user.email} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>O e-mail não pode ser alterado</p>
          </div>
          {msg && (
            <div className={`text-sm px-4 py-3 rounded-xl ${msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {msg}
            </div>
          )}
          <button type="submit" disabled={saving}
            className="disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
            style={{ background: 'var(--accent)' }}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>

      {/* Alterar senha */}
      <div className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Alterar senha</h2>
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Senha atual *</label>
            <input required type="password"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              value={pwForm.currentPassword} onChange={(e) => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Nova senha *</label>
              <input required type="password"
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                value={pwForm.newPassword} onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="mín. 8 caracteres" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Confirmar *</label>
              <input required type="password"
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                value={pwForm.confirm} onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
          </div>
          {pwMsg && (
            <div className={`text-sm px-4 py-3 rounded-xl ${pwMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {pwMsg}
            </div>
          )}
          <button type="submit" disabled={savingPw}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
            {savingPw ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </div>

      {/* Empresa */}
      <div className="rounded-xl border p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Empresa</h2>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <span className="text-blue-700 font-bold">{user.company.name.charAt(0)}</span>
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{user.company.name}</p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{user.companyId}</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button onClick={logout}
        className="w-full border border-red-200 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-xl transition-colors text-sm">
        ↩ Sair da conta
      </button>
    </div>
  );
}
