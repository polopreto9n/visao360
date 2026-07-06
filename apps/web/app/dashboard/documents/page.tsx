'use client';

import { useEffect, useState } from 'react';
import { documentsApi, Document, DocumentStatus } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';

const STATUS_LABELS: Record<DocumentStatus, string> = {
  VALID: 'Válido',
  EXPIRING_SOON: 'Vence em breve',
  EXPIRED: 'Vencido',
};

const STATUS_COLORS: Record<DocumentStatus, string> = {
  VALID: '#16a34a',
  EXPIRING_SOON: '#d97706',
  EXPIRED: '#dc2626',
};

const DOCUMENT_TYPES = [
  'AVCB',
  'CLCB',
  'Laudo Elétrico',
  'Laudo de Elevador',
  'Laudo de Para-raios',
  'Laudo de GLP',
  'Laudo de Caldeira',
  'PPCI',
  'ART / RRT',
  'Alvará de Funcionamento',
  'Certificado de Bombeiros',
  'Contrato de Manutenção',
  'Apólice de Seguro',
  'Outro',
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: color + '20',
      color,
      border: `1px solid ${color}40`,
    }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface FormData {
  name: string;
  type: string;
  customType: string;
  unitId: string;
  fileUrl: string;
  issueDate: string;
  expiryDate: string;
  alertDays: number;
  notes: string;
}

const EMPTY_FORM: FormData = {
  name: '', type: '', customType: '', unitId: '',
  fileUrl: '', issueDate: '', expiryDate: '',
  alertDays: 30, notes: '',
};

function DocumentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<FormData>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const { error } = useToast();

  const set = (k: keyof FormData, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const resolvedType = form.type === 'Outro' ? form.customType : form.type;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { error('Nome do documento é obrigatório'); return; }
    if (!resolvedType.trim()) { error('Tipo do documento é obrigatório'); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        type: resolvedType.trim(),
        unitId: form.unitId || undefined,
        fileUrl: form.fileUrl || undefined,
        issueDate: form.issueDate || undefined,
        expiryDate: form.expiryDate || undefined,
        alertDays: form.alertDays,
        notes: form.notes || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--input)',
    color: 'var(--foreground)', fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 500,
    marginBottom: 4, color: 'var(--muted-foreground)',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Nome *</label>
        <input style={inputStyle} value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ex: AVCB — Bloco A" />
      </div>
      <div>
        <label style={labelStyle}>Tipo *</label>
        <select style={inputStyle} value={form.type}
          onChange={(e) => set('type', e.target.value)}>
          <option value="">Selecione…</option>
          {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {form.type === 'Outro' && (
        <div>
          <label style={labelStyle}>Especifique o tipo *</label>
          <input style={inputStyle} value={form.customType}
            onChange={(e) => set('customType', e.target.value)}
            placeholder="Ex: Laudo de Estanqueidade" />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Data de emissão</label>
          <input type="date" style={inputStyle} value={form.issueDate}
            onChange={(e) => set('issueDate', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Data de vencimento</label>
          <input type="date" style={inputStyle} value={form.expiryDate}
            onChange={(e) => set('expiryDate', e.target.value)} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Alertar com antecedência de (dias)</label>
        <input type="number" min={1} max={365} style={inputStyle}
          value={form.alertDays}
          onChange={(e) => set('alertDays', Number(e.target.value))} />
      </div>
      <div>
        <label style={labelStyle}>URL do arquivo (PDF / imagem)</label>
        <input style={inputStyle} value={form.fileUrl}
          onChange={(e) => set('fileUrl', e.target.value)}
          placeholder="https://…" />
      </div>
      <div>
        <label style={labelStyle}>Observações</label>
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' } as React.CSSProperties}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Notas internas…" />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
            background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const { success, error } = useToast();

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 50 };
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      const res = await documentsApi.list(params);
      setDocs(res.data.data);
      setTotal(res.data.total);
    } catch {
      error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus, search]);

  async function handleCreate(data: Record<string, unknown>) {
    try {
      await documentsApi.create(data);
      success('Documento criado com sucesso');
      setShowForm(false);
      load();
    } catch {
      error('Erro ao criar documento');
    }
  }

  async function handleUpdate(data: Record<string, unknown>) {
    if (!editing) return;
    try {
      await documentsApi.update(editing.id, data);
      success('Documento atualizado com sucesso');
      setEditing(null);
      load();
    } catch {
      error('Erro ao atualizar documento');
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`Excluir documento "${doc.name}"?`)) return;
    try {
      await documentsApi.remove(doc.id);
      success('Documento removido');
      load();
    } catch {
      error('Erro ao remover documento');
    }
  }

  const expired = docs.filter((d) => d.status === 'EXPIRED').length;
  const expiringSoon = docs.filter((d) => d.status === 'EXPIRING_SOON').length;

  const cardStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Documentos e Laudos</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '4px 0 0' }}>
            {total} documento(s){expired > 0 && ` · ${expired} vencido(s)`}{expiringSoon > 0 && ` · ${expiringSoon} a vencer`}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          + Novo Documento
        </button>
      </div>

      {/* Alertas de vencimento */}
      {(expired > 0 || expiringSoon > 0) && (
        <div style={{
          background: expired > 0 ? '#fef2f2' : '#fffbeb',
          border: `1px solid ${expired > 0 ? '#fecaca' : '#fde68a'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          color: expired > 0 ? '#991b1b' : '#92400e', fontSize: 14,
        }}>
          {expired > 0 && <span><strong>{expired} documento(s) VENCIDO(S)</strong> — regularize imediatamente para evitar multas e riscos. </span>}
          {expiringSoon > 0 && <span><strong>{expiringSoon} documento(s) vencendo em breve</strong> — providencie a renovação.</span>}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nome ou tipo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--input)',
            color: 'var(--foreground)', fontSize: 14 }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--input)', color: 'var(--foreground)', fontSize: 14 }}>
          <option value="">Todos os status</option>
          <option value="VALID">Válidos</option>
          <option value="EXPIRING_SOON">Vencendo em breve</option>
          <option value="EXPIRED">Vencidos</option>
        </select>
      </div>

      {/* Formulário modal para criar */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Novo Documento</h2>
            <DocumentForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {/* Formulário modal para editar */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Editar Documento</h2>
            <DocumentForm
              initial={{
                name: editing.name, type: DOCUMENT_TYPES.includes(editing.type) ? editing.type : 'Outro',
                customType: DOCUMENT_TYPES.includes(editing.type) ? '' : editing.type,
                fileUrl: editing.fileUrl ?? '', notes: editing.notes ?? '',
                alertDays: editing.alertDays,
                issueDate: editing.issueDate ? editing.issueDate.slice(0, 10) : '',
                expiryDate: editing.expiryDate ? editing.expiryDate.slice(0, 10) : '',
              }}
              onSave={handleUpdate}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {/* Lista de documentos */}
      {loading ? (
        <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: 40 }}>Carregando…</p>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ fontSize: 16, fontWeight: 500 }}>Nenhum documento cadastrado</p>
          <p style={{ fontSize: 13 }}>Adicione laudos, certificados e documentos com controle de vencimento.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {docs.map((doc) => {
            const days = daysUntil(doc.expiryDate);
            return (
              <div key={doc.id} style={{
                ...cardStyle,
                borderLeft: `4px solid ${STATUS_COLORS[doc.status]}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{doc.name}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>Tipo: <strong>{doc.type}</strong></span>
                      {doc.unit && <span>Unidade: {doc.unit.name}</span>}
                      {doc.asset && <span>Equip.: {doc.asset.name}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {doc.issueDate && <span>Emissão: {formatDate(doc.issueDate)}</span>}
                      {doc.expiryDate && (
                        <span>
                          Vence: <strong style={{ color: STATUS_COLORS[doc.status] }}>
                            {formatDate(doc.expiryDate)}
                            {days !== null && ` (${days >= 0 ? `em ${days} dias` : `${Math.abs(days)} dias atrás`})`}
                          </strong>
                        </span>
                      )}
                    </div>
                    {doc.notes && <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '6px 0 0', fontStyle: 'italic' }}>{doc.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                          background: 'transparent', cursor: 'pointer', fontSize: 12,
                          color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                        Abrir
                      </a>
                    )}
                    <button onClick={() => setEditing(doc)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--foreground)' }}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(doc)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #fca5a5',
                        background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
