'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { checklistsApi, ExecutionDetail } from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { formatDateTime } from '../../../../lib/auth';

const TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventivo', CORRECTIVE: 'Corretivo', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
};

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    checklistsApi.getExecution(id)
      .then((r) => setExecution(r.data))
      .catch(() => router.push('/dashboard/checklists'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return (
    <div className="flex justify-center py-32">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!execution) return null;

  const itemsMap = Object.fromEntries(execution.items.map((i) => [i.checklistItem.id, i]));
  const sortedItems = [...execution.checklist.items].sort((a, b) => a.order - b.order);
  const expectedMap = Object.fromEntries(execution.checklist.items.map((i) => [i.id, i.expectedAnswer]));
  const conformCount = execution.items.filter((i) => i.answer === (expectedMap[i.checklistItem.id] ?? true)).length;
  const nonConformCount = execution.items.filter((i) => i.answer !== null && i.answer !== (expectedMap[i.checklistItem.id] ?? true)).length;
  const okCount = conformCount;
  const nokCount = nonConformCount;
  const photosAll = execution.items.filter((i) => i.photoUrl).map((i) => ({ url: i.photoUrl!, question: i.checklistItem.question }));
  const score = execution.score ?? 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-700 mt-1 transition-colors">
          ← Voltar
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge value={execution.status} />
            <span className="text-xs text-slate-400">{TYPE_LABELS[execution.checklist.type] ?? execution.checklist.type}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">{execution.checklist.name}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
            <span>👤 {execution.user.name}</span>
            {execution.asset && <span>🏗️ {execution.asset.name}</span>}
            {execution.completedAt && <span>📅 {formatDateTime(execution.completedAt)}</span>}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className={`text-3xl font-extrabold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-500' : 'text-red-600'}`}>{score}%</p>
          <p className="text-xs text-slate-500 mt-1">Conformidade</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-extrabold text-green-600">{okCount}</p>
          <p className="text-xs text-slate-500 mt-1">Conformes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-extrabold text-red-600">{nokCount}</p>
          <p className="text-xs text-slate-500 mt-1">Não Conformes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-extrabold text-slate-700">{photosAll.length}</p>
          <p className="text-xs text-slate-500 mt-1">Foto(s)</p>
        </div>
      </div>

      {/* Notas gerais */}
      {execution.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">📝 Observações gerais</p>
          <p className="text-sm text-amber-900">{execution.notes}</p>
        </div>
      )}

      {/* Assinatura digital */}
      {execution.signatureUrl && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">✍️ Assinatura do Responsável</h2>
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex items-center justify-center min-h-[120px]">
            <img
              src={execution.signatureUrl}
              alt="Assinatura digital"
              className="max-h-40 max-w-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightbox(execution.signatureUrl!)}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">Assinatura de {execution.user.name} — {formatDateTime(execution.completedAt ?? execution.createdAt)}</p>
        </div>
      )}

      {/* Galeria de fotos */}
      {photosAll.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">📷 Fotos capturadas ({photosAll.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photosAll.map((p, idx) => (
              <div key={idx} className="group relative">
                <img
                  src={p.url}
                  alt={p.question}
                  className="w-full h-36 object-cover rounded-xl border border-slate-100 cursor-pointer group-hover:opacity-90 transition-opacity"
                  onClick={() => setLightbox(p.url)}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white line-clamp-2">{p.question}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de itens */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">📋 Respostas por item ({sortedItems.length} itens)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {sortedItems.map((item) => {
            const resp = itemsMap[item.id];
            const answered = resp?.answer !== null && resp?.answer !== undefined;
            const isConform = answered && resp.answer === item.expectedAnswer;
            const isNonConform = answered && resp.answer !== item.expectedAnswer;
            return (
              <div key={item.id} className={`px-5 py-4 flex gap-4 ${isNonConform ? 'bg-red-50/40' : ''}`}>
                {/* Ícone de status */}
                <div className="flex-shrink-0 mt-0.5">
                  {!answered ? (
                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-400">{item.order}</span>
                  ) : isConform ? (
                    <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-sm">✅</span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-sm">❌</span>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.question}</p>

                  {resp?.notes && (
                    <p className="text-xs text-slate-500 mt-1 bg-slate-50 rounded-lg px-2 py-1">
                      📝 {resp.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.requiresPhoto && (
                      <span className="text-xs text-slate-400">📷 Exige foto</span>
                    )}
                    {item.requiresNote && (
                      <span className="text-xs text-slate-400">📝 Exige nota</span>
                    )}
                  </div>
                </div>

                {/* Foto do item */}
                {resp?.photoUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={resp.photoUrl}
                      alt={item.question}
                      className="w-16 h-16 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightbox(resp.photoUrl!)}
                    />
                  </div>
                )}

                {/* Resposta + status */}
                <div className="flex-shrink-0 text-right space-y-1">
                  {!answered ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <>
                      <span className={`block text-xs font-bold px-2 py-0.5 rounded-full ${
                        resp.answer ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>{resp.answer ? 'SIM' : 'NÃO'}</span>
                      <span className={`block text-xs font-bold px-2 py-0.5 rounded-full ${
                        isConform ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>{isConform ? '✅ Conforme' : '❌ Não Conforme'}</span>
                      <span className="block text-xs text-slate-400">Esp: {item.expectedAnswer ? 'SIM' : 'NÃO'}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
