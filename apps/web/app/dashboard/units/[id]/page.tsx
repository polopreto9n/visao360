'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type WorkOrder, type Incident } from '../../../../lib/api';
import { useToast } from '../../../../components/ui/Toast';

interface UnitDetail {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  description: string | null;
  isActive: boolean;
  users: { id: string; name: string; email: string; role: string }[];
  _count: { assets: number; checklists: number };
}

interface UnitAsset {
  id: string;
  name: string;
  category: string;
  status: string;
  brand: string | null;
  nextMaintenanceAt: string | null;
  lastMaintenanceAt: string | null;
  warrantyUntil: string | null;
}

interface UnitDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  expiryDate: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#f59e0b', ASSIGNED: '#3b82f6', IN_PROGRESS: '#8b5cf6',
  WAITING_PARTS: '#6366f1', COMPLETED: '#10b981', CANCELLED: '#6b7280',
};

const STATUS_LABELS_WO: Record<string, string> = {
  OPEN: 'Aberta', ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento',
  WAITING_PARTS: 'Aguard. peças', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#ea580c', CRITICAL: '#dc2626',
};

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta', INVESTIGATING: 'Investigando', RESOLVED: 'Resolvida', CLOSED: 'Fechada',
};

const DOC_STATUS_COLORS: Record<string, string> = {
  VALID: '#16a34a', EXPIRING_SOON: '#d97706', EXPIRED: '#dc2626',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', borderTop: `4px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function UnitPortalPage() {
  const params = useParams();
  const router = useRouter();
  const unitId = params.id as string;
  const { error } = useToast();

  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [assets, setAssets] = useState<UnitAsset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [documents, setDocuments] = useState<UnitDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) return;

    Promise.all([
      api.get<UnitDetail>(`/units/${unitId}`),
      api.get<{ data: UnitAsset[] }>('/assets', { params: { unitId, limit: 50 } }),
      api.get<{ data: WorkOrder[] }>('/work-orders', { params: { unitId, limit: 20 } }),
      api.get<{ data: Incident[] }>('/incidents', { params: { unitId, limit: 20 } }),
      api.get<{ data: UnitDocument[] }>('/documents', { params: { unitId, limit: 20 } }),
    ])
      .then(([unitRes, assetsRes, woRes, incRes, docRes]) => {
        setUnit(unitRes.data);
        setAssets(assetsRes.data.data);
        setWorkOrders(woRes.data.data);
        setIncidents(incRes.data.data);
        setDocuments(docRes.data.data);
      })
      .catch(() => error('Erro ao carregar dados da unidade'))
      .finally(() => setLoading(false));
  }, [unitId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <p style={{ color: 'var(--muted-foreground)' }}>Carregando portal da unidade…</p>
      </div>
    );
  }

  if (!unit) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: '#dc2626' }}>Unidade não encontrada.</p>
        <button onClick={() => router.back()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>Voltar</button>
      </div>
    );
  }

  const openWOs = workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status));
  const overdueWOs = workOrders.filter((w) => w.dueDate && new Date(w.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(w.status));
  const openIncidents = incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
  const expiredDocs = documents.filter((d) => d.status === 'EXPIRED');
  const expiringDocs = documents.filter((d) => d.status === 'EXPIRING_SOON');

  const sectionTitle: React.CSSProperties = {
    fontSize: 16, fontWeight: 700, margin: '0 0 12px',
    display: 'flex', alignItems: 'center', gap: 8,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', fontSize: 13,
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', borderBottom: '1px solid var(--border)',
    color: 'var(--foreground)', verticalAlign: 'middle',
  };

  const thStyle: React.CSSProperties = {
    ...tdStyle,
    fontWeight: 600, color: 'var(--muted-foreground)', background: 'var(--card)',
    textAlign: 'left',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 13, padding: 0, marginBottom: 8 }}>
          ← Voltar para Condomínios
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{unit.name}</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '4px 0 0' }}>
              {unit.code && <span style={{ fontFamily: 'monospace', marginRight: 12 }}>{unit.code}</span>}
              {unit.address}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/dashboard/work-orders?unitId=${unit.id}`}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: 13, textDecoration: 'none' }}>
              + Nova OS
            </Link>
            <Link href={`/dashboard/incidents?unitId=${unit.id}`}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, textDecoration: 'none' }}>
              + Ocorrência
            </Link>
          </div>
        </div>
      </div>

      {/* Alertas críticos */}
      {(overdueWOs.length > 0 || expiredDocs.length > 0) && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#991b1b', fontSize: 14 }}>
          {overdueWOs.length > 0 && <span><strong>{overdueWOs.length} OS vencida(s)</strong> · </span>}
          {expiredDocs.length > 0 && <span><strong>{expiredDocs.length} documento(s) expirado(s)</strong> — requer atenção imediata</span>}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Equipamentos" value={assets.length} color="#2563eb" />
        <StatCard label="OS Abertas" value={openWOs.length} color="#d97706" />
        <StatCard label="OS Vencidas" value={overdueWOs.length} color="#dc2626" />
        <StatCard label="Ocorrências abertas" value={openIncidents.length} color="#7c3aed" />
        <StatCard label="Docs. vencidos" value={expiredDocs.length} color="#dc2626" />
        <StatCard label="Docs. a vencer" value={expiringDocs.length} color="#d97706" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Ordens de Serviço abertas */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
          <h2 style={sectionTitle}>🔧 Ordens de Serviço Abertas ({openWOs.length})</h2>
          {openWOs.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: 0 }}>Nenhuma OS aberta.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['Código', 'Título', 'Prioridade', 'Status', 'Prazo', 'Responsável'].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openWOs.map((wo) => (
                    <tr key={wo.id}>
                      <td style={tdStyle}>
                        <Link href={`/dashboard/work-orders/${wo.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12 }}>
                          {wo.code}
                        </Link>
                      </td>
                      <td style={tdStyle}>{wo.title}</td>
                      <td style={tdStyle}>
                        <span style={{ color: PRIORITY_COLORS[wo.priority], fontWeight: 600, fontSize: 12 }}>
                          {PRIORITY_LABELS[wo.priority] ?? wo.priority}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ background: (STATUS_COLORS[wo.status] ?? '#6b7280') + '20', color: STATUS_COLORS[wo.status] ?? '#6b7280', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                          {STATUS_LABELS_WO[wo.status] ?? wo.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: (wo.dueDate && new Date(wo.dueDate) < new Date()) ? '#dc2626' : 'var(--foreground)' }}>
                        {formatDate(wo.dueDate)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--muted-foreground)' }}>
                        {wo.assignee?.name ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Equipamentos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h2 style={sectionTitle}>🏗️ Equipamentos ({assets.length})</h2>
          {assets.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhum equipamento cadastrado.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {assets.slice(0, 10).map((asset) => {
                const isOverdue = asset.nextMaintenanceAt && new Date(asset.nextMaintenanceAt) < new Date();
                return (
                  <div key={asset.id} style={{ padding: '10px 12px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{asset.name}</span>
                        <span style={{ color: 'var(--muted-foreground)', fontSize: 12, marginLeft: 8 }}>{asset.category}</span>
                        {asset.brand && <span style={{ color: 'var(--muted-foreground)', fontSize: 12, marginLeft: 8 }}>· {asset.brand}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: asset.status === 'ACTIVE' ? '#16a34a' : asset.status === 'MAINTENANCE' ? '#d97706' : '#6b7280', fontWeight: 600 }}>
                        {asset.status}
                      </span>
                    </div>
                    {asset.nextMaintenanceAt && (
                      <div style={{ fontSize: 11, color: isOverdue ? '#dc2626' : 'var(--muted-foreground)', marginTop: 4 }}>
                        {isOverdue ? '⚠️' : '📅'} Próx. manutenção: {formatDate(asset.nextMaintenanceAt)}
                      </div>
                    )}
                  </div>
                );
              })}
              {assets.length > 10 && (
                <Link href={`/dashboard/assets?unitId=${unit.id}`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', textAlign: 'center', padding: '8px 0' }}>
                  Ver todos os {assets.length} equipamentos →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Ocorrências */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h2 style={sectionTitle}>⚠️ Ocorrências Abertas ({openIncidents.length})</h2>
          {openIncidents.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhuma ocorrência aberta.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openIncidents.slice(0, 8).map((inc) => (
                <div key={inc.id} style={{ padding: '10px 12px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{inc.title}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{inc.severity}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{INCIDENT_STATUS_LABELS[inc.status] ?? inc.status}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{formatDate(inc.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documentos */}
        {documents.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
            <h2 style={sectionTitle}>📄 Documentos ({documents.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['Documento', 'Tipo', 'Validade', 'Status'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td style={tdStyle}>{doc.name}</td>
                      <td style={{ ...tdStyle, color: 'var(--muted-foreground)' }}>{doc.type}</td>
                      <td style={{ ...tdStyle, color: doc.status === 'EXPIRED' ? '#dc2626' : doc.status === 'EXPIRING_SOON' ? '#d97706' : 'var(--foreground)' }}>
                        {formatDate(doc.expiryDate)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: DOC_STATUS_COLORS[doc.status] ?? '#6b7280', fontWeight: 600, fontSize: 12 }}>
                          {doc.status === 'VALID' ? 'Válido' : doc.status === 'EXPIRING_SOON' ? 'A vencer' : 'Vencido'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Equipe */}
        {unit.users.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <h2 style={sectionTitle}>👥 Equipe ({unit.users.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unit.users.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2563eb20', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{u.role} · {u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
