'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

interface AssetInfo {
  assetId: string;
  assetName: string;
  category: string;
  unitName: string;
  unitAddress: string | null;
  companyName: string;
  companyLogoUrl: string | null;
}

type Step = 'loading' | 'info' | 'form' | 'success' | 'error';

export default function PublicReportPage() {
  const params = useParams();
  const qrCode = params.qrCode as string;

  const [step, setStep] = useState<Step>('loading');
  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  useEffect(() => {
    if (!qrCode) return;
    api.get<AssetInfo>(`/public/asset/${qrCode}`)
      .then((res) => { setAssetInfo(res.data); setStep('info'); })
      .catch(() => { setErrorMsg('Equipamento não encontrado ou inativo.'); setStep('error'); });
  }, [qrCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 5) {
      alert('Descreva o problema em pelo menos 5 caracteres'); return;
    }
    if (!description.trim() || description.trim().length < 10) {
      alert('Forneça mais detalhes sobre o problema (mínimo 10 caracteres)'); return;
    }
    setSubmitting(true);
    try {
      await api.post(`/public/asset/${qrCode}/report`, {
        title: title.trim(),
        description: description.trim(),
        reporterName: reporterName.trim() || undefined,
        reporterPhone: reporterPhone.trim() || undefined,
      });
      setStep('success');
    } catch {
      alert('Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1.5px solid #e5e7eb',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    color: '#111827',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
  };

  if (step === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <p style={{ color: '#6b7280', fontSize: 16 }}>Carregando informações…</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <h2 style={{ color: '#dc2626', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Equipamento não encontrado</h2>
          <p style={{ color: '#6b7280', fontSize: 15 }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 36 }}>✅</div>
          <h2 style={{ color: '#16a34a', fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>Ocorrência registrada!</h2>
          <p style={{ color: '#374151', fontSize: 15, lineHeight: 1.6 }}>
            Sua solicitação foi enviada com sucesso.<br />
            A equipe de manutenção foi notificada e irá verificar o problema em breve.
          </p>
          <div style={{ marginTop: 24, padding: '16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
            <p style={{ color: '#15803d', fontSize: 13, margin: 0 }}>
              <strong>{assetInfo?.assetName}</strong> — {assetInfo?.unitName}
            </p>
          </div>
          <button
            onClick={() => { setStep('form'); setTitle(''); setDescription(''); setReporterName(''); setReporterPhone(''); }}
            style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}
          >
            Reportar outro problema
          </button>
        </div>
      </div>
    );
  }

  if (step === 'info' && assetInfo) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            {assetInfo.companyLogoUrl ? (
              <img src={assetInfo.companyLogoUrl} alt={assetInfo.companyName} style={{ maxHeight: 50, objectFit: 'contain', marginBottom: 8 }} />
            ) : (
              <div style={{ width: 48, height: 48, background: '#1e40af', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 22, color: '#fff', fontWeight: 900 }}>V</div>
            )}
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{assetInfo.companyName}</p>
          </div>

          <div style={{ background: '#eff6ff', borderRadius: 14, padding: 20, marginBottom: 24, borderLeft: '4px solid #2563eb' }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px' }}>Equipamento</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{assetInfo.assetName}</p>
            <p style={{ fontSize: 13, color: '#4b5563', margin: 0 }}>
              {assetInfo.category} · {assetInfo.unitName}
              {assetInfo.unitAddress && ` · ${assetInfo.unitAddress}`}
            </p>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Encontrou algum problema?</h2>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>Relate aqui e nossa equipe será notificada imediatamente.</p>

          <button
            onClick={() => setStep('form')}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            Reportar problema →
          </button>
        </div>
      </div>
    );
  }

  // Step: form
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <button
          onClick={() => setStep('info')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, marginBottom: 16, padding: 0 }}
        >
          ← Voltar
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Reportar Problema</h2>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 24px' }}>
          {assetInfo?.assetName} · {assetInfo?.unitName}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Qual é o problema? *</label>
            <input
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Vazamento, barulho excessivo, porta travada…"
              maxLength={200}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>{title.length}/200</p>
          </div>

          <div>
            <label style={labelStyle}>Descreva com mais detalhes *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' } as React.CSSProperties}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Onde está o problema? Quando começou? Há risco de segurança?"
              maxLength={1000}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>{description.length}/1000</p>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>Identificação (opcional — para contato da equipe):</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ ...labelStyle, fontWeight: 500 }}>Seu nome</label>
                <input style={inputStyle} value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="João Silva" maxLength={100} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontWeight: 500 }}>Telefone</label>
                <input style={inputStyle} value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '14px', borderRadius: 12, border: 'none', background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', marginTop: 8 }}
          >
            {submitting ? 'Enviando…' : 'Enviar Ocorrência'}
          </button>
        </form>
      </div>
    </div>
  );
}
