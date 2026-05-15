import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checklistsApi, schedulesApi, Checklist, ChecklistSchedule, ExecutionItemPayload } from '../../services/api';
import { useOfflineStore } from '../../stores/offline.store';
import { useNetwork } from '../../hooks/useNetwork';
import { SignaturePad } from '../../components/SignaturePad';
import { PhotoCapture } from '../../components/PhotoCapture';
import { getScheduleStatus, ScheduleStatus, ScheduleStatusResult } from '../../utils/scheduleStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemState {
  answer: boolean | null;
  notes: string;
  photos: string[];
}

type Step = 'items' | 'notes' | 'signature' | 'done';

type FilterTab = 'all' | 'available' | 'overdue' | 'blocked';

const TYPE_LABEL: Record<string, string> = {
  PREVENTIVE: 'Preventivo', CORRECTIVE: 'Corretivo', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
};
const TYPE_ICON: Record<string, string> = {
  PREVENTIVE: '🛡️', CORRECTIVE: '🔨', INSPECTION: '🔍', AUDIT: '📋',
};

// ─── Tela de checklists ───────────────────────────────────────────────────────

export default function ChecklistsScreen() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [schedules, setSchedules] = useState<ChecklistSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<Checklist | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const { isOnline } = useNetwork();
  const pendingCount = useOfflineStore((s) => s.queue.length);

  const load = useCallback(async () => {
    try {
      const [clRes, schRes] = await Promise.allSettled([
        checklistsApi.list(),
        schedulesApi.mine(),
      ]);
      if (clRes.status === 'fulfilled') setChecklists(clRes.value.data.data);
      if (schRes.status === 'fulfilled') setSchedules(schRes.value.data);
    } catch { /* mantém cache */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Mapeia checklistId → schedule para lookup rápido
  const scheduleByChecklistId = Object.fromEntries(
    schedules.map((s) => [s.checklist.id, s]),
  );

  // Calcula status de cada agenda
  const schedulesWithStatus = schedules.map((sch) => ({
    sch,
    st: getScheduleStatus(sch),
  }));

  // Filtra agendas pela tab ativa
  const filteredSchedules = schedulesWithStatus.filter(({ st }) => {
    if (filterTab === 'available') return st.canExecute && (st.status === 'AVAILABLE' || st.status === 'DUE_SOON');
    if (filterTab === 'overdue') return st.status === 'OVERDUE' || st.status === 'EXPIRED';
    if (filterTab === 'blocked') return st.status === 'BLOCKED';
    return true;
  });

  // Contadores para badges das tabs
  const counts = {
    available: schedulesWithStatus.filter(({ st }) => st.canExecute && (st.status === 'AVAILABLE' || st.status === 'DUE_SOON')).length,
    overdue: schedulesWithStatus.filter(({ st }) => st.status === 'OVERDUE' || st.status === 'EXPIRED').length,
    blocked: schedulesWithStatus.filter(({ st }) => st.status === 'BLOCKED').length,
  };

  async function handleStart(cl: Checklist, forceStart = false) {
    const schedule = scheduleByChecklistId[cl.id];
    if (schedule && !forceStart) {
      const st = getScheduleStatus(schedule);
      if (!st.canExecute) {
        if (st.status === 'BLOCKED') {
          Alert.alert(
            '⚪ Checklist Bloqueado',
            `Este checklist ficará disponível em ${st.daysToRelease} dia(s).\n\nData de liberação: ${st.releaseDate?.toLocaleDateString('pt-BR')}`,
            [{ text: 'OK' }],
          );
        } else {
          Alert.alert('Prazo Expirado', 'O prazo de tolerância deste checklist expirou. Contate o gestor.');
        }
        return;
      }
    }

    if (!isOnline) {
      setExecutionId(null);
      setExecuting(cl);
      return;
    }
    try {
      const res = await checklistsApi.startExecution(cl.id);
      setExecutionId(res.data.id);
      setExecuting(cl);
    } catch {
      Alert.alert('Erro', 'Não foi possível iniciar. Tente novamente.');
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const FILTER_TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'available', label: 'Disponíveis', count: counts.available },
    { key: 'overdue', label: 'Atrasadas', count: counts.overdue },
    { key: 'blocked', label: 'Bloqueadas', count: counts.blocked },
  ];

  return (
    <View style={s.container}>
      {/* Banner offline/pendente */}
      {(!isOnline || pendingCount > 0) && (
        <View style={[s.statusBand, !isOnline ? s.offlineBand : s.pendingBand]}>
          <Text style={s.statusText}>
            {!isOnline ? '📵 Offline — execuções serão salvas localmente' : `☁️ ${pendingCount} aguardando sincronização`}
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={undefined}
      >
        {/* ── Seção de agenda ── */}
        {schedules.length > 0 && (
          <View style={s.agendaSection}>
            <View style={s.agendaHeader}>
              <Text style={s.agendaTitle}>📅 Minha Agenda</Text>
              <Text style={s.agendaCount}>{schedules.length} item(ns)</Text>
            </View>

            {/* Filter tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
              <View style={s.tabsRow}>
                {FILTER_TABS.map((tab) => {
                  const active = filterTab === tab.key;
                  const hasAlert = (tab.key === 'overdue') && (tab.count ?? 0) > 0;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setFilterTab(tab.key)}
                      style={[s.tab, active && s.tabActive, hasAlert && !active && s.tabAlert]}
                    >
                      <Text style={[s.tabText, active && s.tabTextActive, hasAlert && !active && s.tabTextAlert]}>
                        {tab.label}
                        {tab.count != null && tab.count > 0 ? ` (${tab.count})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Cards de agenda */}
            {filteredSchedules.length === 0 ? (
              <View style={s.emptyTab}>
                <Text style={s.emptyTabText}>Nenhum item nesta categoria</Text>
              </View>
            ) : (
              filteredSchedules.map(({ sch, st }) => (
                <ScheduleCard
                  key={sch.id}
                  schedule={sch}
                  statusResult={st}
                  onExecute={() => {
                    const cl = checklists.find((c) => c.id === sch.checklist.id);
                    if (cl) handleStart(cl, true);
                    else Alert.alert('Checklist não carregado', 'Aguarde ou recarregue.');
                  }}
                />
              ))
            )}
          </View>
        )}

        {/* ── Checklists avulsos ── */}
        <View style={s.listSection}>
          {schedules.length > 0 && (
            <Text style={s.sectionTitle}>📋 Checklists Avulsos</Text>
          )}
          {checklists.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={s.emptyTitle}>Nenhum checklist disponível</Text>
              {!isOnline && <Text style={s.emptySub}>Conecte-se para carregar</Text>}
            </View>
          ) : (
            checklists.map((item) => {
              const sch = scheduleByChecklistId[item.id];
              const st = sch ? getScheduleStatus(sch) : null;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.card, st && !st.canExecute && s.cardBlocked]}
                  onPress={() => handleStart(item)}
                  activeOpacity={0.75}
                >
                  {/* Status badge se tem agenda */}
                  {st && (
                    <View style={[s.cardStatusBadge, { backgroundColor: st.bgColor, borderColor: st.borderColor }]}>
                      <Text style={[s.cardStatusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  )}

                  <View style={s.cardTop}>
                    <Text style={s.cardIcon}>{TYPE_ICON[item.type] ?? '📋'}</Text>
                    <View style={s.typePill}>
                      <Text style={s.typeText}>{TYPE_LABEL[item.type] ?? item.type}</Text>
                    </View>
                    {item.intervalDays && (
                      <Text style={s.interval}>🔁 {item.intervalDays}d</Text>
                    )}
                  </View>

                  <Text style={[s.cardTitle, st && !st.canExecute && { color: '#9ca3af' }]}>{item.name}</Text>
                  {item.description && (
                    <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                  )}

                  <View style={s.cardFooter}>
                    <View style={s.countBadge}>
                      <Ionicons name="list-outline" size={13} color="#9ca3af" />
                      <Text style={s.countText}>{item.items.length} itens</Text>
                    </View>
                    {item.unit && <Text style={s.unitText} numberOfLines={1}>{item.unit.name}</Text>}
                    <View style={[s.startPill, st && !st.canExecute && s.startPillBlocked]}>
                      <Text style={s.startText}>{st && !st.canExecute ? '🔒 Bloqueado' : 'Executar →'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Modal de execução */}
      <Modal
        visible={!!executing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          Alert.alert('Cancelar execução?', 'As respostas serão perdidas.', [
            { text: 'Continuar', style: 'cancel' },
            { text: 'Cancelar', style: 'destructive', onPress: () => setExecuting(null) },
          ]);
        }}
      >
        {executing && (
          <ExecutionFlow
            checklist={executing}
            executionId={executionId}
            isOnline={isOnline}
            onClose={() => { setExecuting(null); setExecutionId(null); load(); }}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── ScheduleCard ─────────────────────────────────────────────────────────────

function ScheduleCard({
  schedule, statusResult, onExecute,
}: {
  schedule: ChecklistSchedule;
  statusResult: ScheduleStatusResult;
  onExecute: () => void;
}) {
  const st = statusResult;
  const repeatDays = schedule.repeatDays ?? 0;
  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  return (
    <View style={[sc.card, { borderColor: st.borderColor, backgroundColor: st.bgColor }]}>
      {/* Status badge */}
      <View style={sc.badgeRow}>
        <View style={[sc.badge, { backgroundColor: st.color }]}>
          <Text style={sc.badgeText}>{st.label.toUpperCase()}</Text>
        </View>
        {repeatDays > 0 && (
          <Text style={sc.repeatText}>🔁 A cada {repeatDays}d</Text>
        )}
      </View>

      {/* Nome e equipamento */}
      <Text style={sc.name} numberOfLines={2}>
        {schedule.name ?? schedule.checklist.name}
      </Text>
      {schedule.asset && (
        <Text style={sc.asset}>📦 {schedule.asset.name}</Text>
      )}

      {/* Info de datas */}
      <Text style={[sc.sublabel, { color: st.color }]}>{st.sublabel}</Text>

      {/* Datas detalhadas */}
      <View style={sc.datesRow}>
        {st.releaseDate && (
          <View style={sc.dateItem}>
            <Text style={sc.dateLabel}>🔓 Liberado</Text>
            <Text style={sc.dateValue}>{fmt(st.releaseDate)}</Text>
          </View>
        )}
        {st.dueDate && (
          <View style={sc.dateItem}>
            <Text style={sc.dateLabel}>📅 Vencimento</Text>
            <Text style={[sc.dateValue, { color: st.status === 'OVERDUE' ? '#dc2626' : '#374151' }]}>
              {fmt(st.dueDate)}
            </Text>
          </View>
        )}
        {st.expirationDate && st.status === 'OVERDUE' && (
          <View style={sc.dateItem}>
            <Text style={sc.dateLabel}>⏳ Expira em</Text>
            <Text style={sc.dateValue}>{fmt(st.expirationDate)}</Text>
          </View>
        )}
      </View>

      {/* Barra de progresso do ciclo */}
      {repeatDays > 0 && (
        <View style={sc.progressSection}>
          <View style={sc.progressTrack}>
            <View style={[sc.progressFill, {
              width: `${st.cycleProgressPct}%` as any,
              backgroundColor: st.color,
            }]} />
          </View>
          <Text style={[sc.progressLabel, { color: st.iconColor }]}>
            {Math.round(st.cycleProgressPct)}% do ciclo
          </Text>
        </View>
      )}

      {/* Botão de ação */}
      <TouchableOpacity
        style={[sc.btn, st.canExecute ? { backgroundColor: st.color } : sc.btnBlocked]}
        onPress={onExecute}
        disabled={!st.canExecute}
        activeOpacity={0.8}
      >
        <Text style={sc.btnText}>
          {st.status === 'BLOCKED'
            ? `🔒 Bloqueado — libera em ${st.daysToRelease}d`
            : st.status === 'EXPIRED'
            ? '❌ Prazo expirado'
            : st.status === 'OVERDUE'
            ? '🚨 Executar agora'
            : st.status === 'DUE_SOON'
            ? '⚡ Executar'
            : '▶ Executar'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Fluxo de execução ────────────────────────────────────────────────────────

function ExecutionFlow({
  checklist,
  executionId,
  isOnline,
  onClose,
}: {
  checklist: Checklist;
  executionId: string | null;
  isOnline: boolean;
  onClose: () => void;
}) {
  const sortedItems = [...checklist.items].sort((a, b) => a.order - b.order);
  const [step, setStep] = useState<Step>('items');
  const [current, setCurrent] = useState(0);
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(
    Object.fromEntries(sortedItems.map((i) => [i.id, { answer: null, notes: '', photos: [] }])),
  );
  const [globalNotes, setGlobalNotes] = useState('');
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const { enqueue } = useOfflineStore();
  const item = sortedItems[current];
  const totalItems = sortedItems.length;
  const answeredCount = Object.values(itemStates).filter((s) => s.answer !== null).length;
  const progressPct = (answeredCount / totalItems) * 100;

  function setAnswer(id: string, answer: boolean) {
    setItemStates((p) => ({ ...p, [id]: { ...p[id], answer } }));
  }
  function setNote(id: string, notes: string) {
    setItemStates((p) => ({ ...p, [id]: { ...p[id], notes } }));
  }
  function setPhotos(id: string, photos: string[]) {
    setItemStates((p) => ({ ...p, [id]: { ...p[id], photos } }));
  }

  function buildPayload(): ExecutionItemPayload[] {
    return sortedItems.map((i) => ({
      checklistItemId: i.id,
      answer: itemStates[i.id].answer ?? false,
      notes: itemStates[i.id].notes || undefined,
      photoUrl: itemStates[i.id].photos[0] || undefined,
    }));
  }

  function calcScore(): number {
    const conforms = sortedItems.filter(
      (item) => itemStates[item.id].answer === item.expectedAnswer,
    ).length;
    return Math.round((conforms / totalItems) * 100);
  }

  async function handleSubmit(sig: string) {
    setSignatureUrl(sig);
    setSubmitting(true);

    const payload = buildPayload();
    const score = calcScore();
    setFinalScore(score);

    if (!isOnline || !executionId) {
      // Modo offline — salva na fila
      enqueue({
        checklistId: checklist.id,
        checklistName: checklist.name,
        items: payload,
        notes: globalNotes || undefined,
        signatureUrl: sig,
      });
      setSubmitting(false);
      setStep('done');
      return;
    }

    // Online — envia para a API
    try {
      await checklistsApi.submitExecution(executionId, payload, globalNotes || undefined, sig);
      setSubmitting(false);
      setStep('done');
    } catch {
      Alert.alert('Erro', 'Falha ao enviar. Salvando offline...', [{ text: 'OK' }]);
      enqueue({
        checklistId: checklist.id,
        checklistName: checklist.name,
        items: payload,
        notes: globalNotes || undefined,
        signatureUrl: sig,
      });
      setSubmitting(false);
      setStep('done');
    }
  }

  // ── STEP: Items ──────────────────────────────────────────────────────────────

  if (step === 'items') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={exec.header}>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Cancelar?', 'Perderá as respostas já dadas.', [
                { text: 'Não', style: 'cancel' },
                { text: 'Sim, cancelar', style: 'destructive', onPress: onClose },
              ])
            }
            style={exec.closeBtn}
          >
            <Ionicons name="close" size={20} color="#6b7280" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={exec.headerTitle} numberOfLines={1}>{checklist.name}</Text>
            <Text style={exec.headerSub}>
              Item {current + 1} de {totalItems} · {answeredCount} respondidos
              {!isOnline ? ' · 📵 Offline' : ''}
            </Text>
          </View>
        </View>

        {/* Barra de progresso */}
        <View style={exec.progressBar}>
          <View style={[exec.progressFill, { width: `${progressPct}%` }]} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={exec.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pergunta */}
          <View style={exec.questionCard}>
            <View style={exec.questionNum}>
              <Text style={exec.questionNumText}>{item.order}</Text>
            </View>
            <Text style={exec.questionText}>{item.question}</Text>
            {item.description ? (
              <Text style={exec.questionDesc}>{item.description}</Text>
            ) : null}

            {/* Sim / Não */}
            <View style={exec.answerRow}>
              {[true, false].map((val) => {
                const selected = itemStates[item.id].answer === val;
                return (
                  <TouchableOpacity
                    key={String(val)}
                    onPress={() => setAnswer(item.id, val)}
                    style={[
                      exec.answerBtn,
                      selected && (val ? exec.answerYes : exec.answerNo),
                    ]}
                  >
                    <Ionicons
                      name={val ? 'checkmark-circle' : 'close-circle'}
                      size={22}
                      color={selected ? '#fff' : val ? '#16a34a' : '#dc2626'}
                    />
                    <Text style={[exec.answerBtnText, selected && { color: '#fff' }]}>
                      {val ? 'Sim / OK' : 'Não / NOK'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notas */}
            {(item.requiresNote || (itemStates[item.id].answer !== null && itemStates[item.id].answer !== item.expectedAnswer)) && (
              <TextInput
                style={exec.noteInput}
                value={itemStates[item.id].notes}
                onChangeText={(t) => setNote(item.id, t)}
                placeholder={
                  item.requiresNote
                    ? 'Observação obrigatória...'
                    : 'Descreva o problema encontrado...'
                }
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            )}

            {/* Fotos */}
            {item.requiresPhoto && (
              <PhotoCapture
                photos={itemStates[item.id].photos}
                onPhotosChange={(p) => setPhotos(item.id, p)}
                required
                label="Foto obrigatória"
                maxPhotos={3}
              />
            )}
          </View>

          {/* Navegação */}
          <View style={exec.navRow}>
            <TouchableOpacity
              disabled={current === 0}
              onPress={() => setCurrent((c) => c - 1)}
              style={[exec.navBtn, current === 0 && exec.navBtnDisabled]}
            >
              <Text style={[exec.navBtnText, current === 0 && { color: '#d1d5db' }]}>
                ← Anterior
              </Text>
            </TouchableOpacity>

            {current < totalItems - 1 ? (
              <TouchableOpacity
                onPress={() => setCurrent((c) => c + 1)}
                style={exec.navBtnNext}
              >
                <Text style={exec.navBtnNextText}>Próximo →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setStep('notes')}
                style={exec.navBtnFinish}
              >
                <Text style={exec.navBtnNextText}>Finalizar →</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Dots de progresso */}
          <View style={exec.dots}>
            {sortedItems.map((si, idx) => (
              <TouchableOpacity
                key={si.id}
                onPress={() => setCurrent(idx)}
                style={[
                  exec.dot,
                  idx === current && exec.dotActive,
                  itemStates[si.id].answer !== null && exec.dotAnswered,
                ]}
              />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── STEP: Notas gerais ───────────────────────────────────────────────────────

  if (step === 'notes') {
    return (
      <View style={{ flex: 1 }}>
        <View style={exec.header}>
          <TouchableOpacity onPress={() => setStep('items')} style={exec.closeBtn}>
            <Ionicons name="arrow-back" size={20} color="#6b7280" />
          </TouchableOpacity>
          <View>
            <Text style={exec.headerTitle}>Observações Gerais</Text>
            <Text style={exec.headerSub}>Etapa 2 de 3 · Resumo da inspeção</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={exec.scrollContent}>
          {/* Resumo rápido */}
          <View style={exec.summaryCard}>
            <Text style={exec.summaryTitle}>Resumo da Inspeção</Text>
            <View style={exec.summaryRow}>
              <View style={exec.summaryItem}>
                <Text style={[exec.summaryValue, { color: '#16a34a' }]}>
                  {sortedItems.filter((i) => itemStates[i.id].answer === i.expectedAnswer).length}
                </Text>
                <Text style={exec.summaryLabel}>Conformes</Text>
              </View>
              <View style={exec.summaryItem}>
                <Text style={[exec.summaryValue, { color: '#dc2626' }]}>
                  {sortedItems.filter((i) => itemStates[i.id].answer !== null && itemStates[i.id].answer !== i.expectedAnswer).length}
                </Text>
                <Text style={exec.summaryLabel}>Não conformes</Text>
              </View>
              <View style={exec.summaryItem}>
                <Text style={[exec.summaryValue, { color: '#6b7280' }]}>
                  {Object.values(itemStates).filter((s) => s.answer === null).length}
                </Text>
                <Text style={exec.summaryLabel}>Sem resposta</Text>
              </View>
            </View>
            <View style={exec.scoreRow}>
              <Text style={exec.scoreText}>{calcScore()}% de conformidade</Text>
              <View
                style={[
                  exec.scorePill,
                  {
                    backgroundColor:
                      calcScore() >= 80 ? '#dcfce7' : calcScore() >= 60 ? '#fef9c3' : '#fee2e2',
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    color:
                      calcScore() >= 80 ? '#16a34a' : calcScore() >= 60 ? '#ca8a04' : '#dc2626',
                  }}
                >
                  {calcScore() >= 80 ? 'Excelente' : calcScore() >= 60 ? 'Atenção' : 'Crítico'}
                </Text>
              </View>
            </View>
          </View>

          {/* Notas globais */}
          <View style={exec.questionCard}>
            <Text style={exec.questionText}>Observações gerais sobre a inspeção</Text>
            <TextInput
              style={[exec.noteInput, { minHeight: 120 }]}
              value={globalNotes}
              onChangeText={setGlobalNotes}
              placeholder="Registre aqui quaisquer observações relevantes..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity style={exec.navBtnFinish} onPress={() => setStep('signature')}>
            <Text style={exec.navBtnNextText}>Ir para assinatura →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── STEP: Assinatura ─────────────────────────────────────────────────────────

  if (step === 'signature') {
    return (
      <View style={{ flex: 1 }}>
        <View style={exec.header}>
          <TouchableOpacity onPress={() => setStep('notes')} style={exec.closeBtn}>
            <Ionicons name="arrow-back" size={20} color="#6b7280" />
          </TouchableOpacity>
          <View>
            <Text style={exec.headerTitle}>Assinatura Digital</Text>
            <Text style={exec.headerSub}>
              Etapa 3 de 3 · {submitting ? 'Enviando...' : 'Confirme a inspeção'}
            </Text>
          </View>
        </View>

        {submitting ? (
          <View style={exec.loadingCenter}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={exec.loadingText}>
              {!isOnline ? 'Salvando localmente...' : 'Enviando inspeção...'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={exec.scrollContent}>
            <SignaturePad
              onSave={handleSubmit}
              onCancel={() => setStep('notes')}
            />
          </ScrollView>
        )}
      </View>
    );
  }

  // ── STEP: Concluído ──────────────────────────────────────────────────────────

  if (step === 'done') {
    const savedOffline = !isOnline || !executionId;
    return (
      <View style={exec.doneContainer}>
        <Text style={exec.doneEmoji}>
          {finalScore >= 80 ? '✅' : finalScore >= 60 ? '⚠️' : '❌'}
        </Text>

        <Text style={exec.doneTitle}>
          {savedOffline ? 'Salvo offline!' : 'Inspeção concluída!'}
        </Text>

        <View style={exec.scoreDisplay}>
          <Text style={exec.scoreDisplayValue}>{finalScore}%</Text>
          <Text style={exec.scoreDisplayLabel}>de conformidade</Text>
        </View>

        <Text
          style={[
            exec.scoreMsg,
            {
              color:
                finalScore >= 80 ? '#16a34a' : finalScore >= 60 ? '#ca8a04' : '#dc2626',
            },
          ]}
        >
          {finalScore >= 80
            ? 'Excelente — todos os pontos críticos conformes'
            : finalScore >= 60
            ? 'Atenção — alguns itens requerem acompanhamento'
            : 'Crítico — intervenção imediata necessária'}
        </Text>

        {savedOffline && (
          <View style={exec.offlineNotice}>
            <Text style={exec.offlineNoticeText}>
              📵 Dados salvos localmente. Serão sincronizados automaticamente quando houver conexão.
            </Text>
          </View>
        )}

        <TouchableOpacity style={exec.doneBtn} onPress={onClose}>
          <Text style={exec.doneBtnText}>Concluir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  statusBand: { paddingHorizontal: 16, paddingVertical: 10 },
  offlineBand: { backgroundColor: '#dc2626' },
  pendingBand: { backgroundColor: '#2563eb' },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Agenda section
  agendaSection: { margin: 16, gap: 12 },
  agendaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agendaTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  agendaCount: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

  // Filter tabs
  tabsScroll: { marginBottom: 4 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
  },
  tabActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  tabAlert: { borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#fff' },
  tabTextAlert: { color: '#dc2626' },

  emptyTab: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTabText: { fontSize: 13, color: '#94a3b8' },

  // Lista avulsos
  listSection: { paddingHorizontal: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 4, marginTop: 8 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },

  // Checklist card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardBlocked: { opacity: 0.7 },
  cardStatusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  cardStatusText: { fontSize: 11, fontWeight: '700' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon: { fontSize: 22 },
  typePill: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },
  interval: { fontSize: 11, color: '#94a3b8', marginLeft: 'auto' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countText: { fontSize: 12, color: '#9ca3af' },
  unitText: { flex: 1, fontSize: 12, color: '#9ca3af' },
  startPill: {
    backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
  },
  startPillBlocked: { backgroundColor: '#e5e7eb' },
  startText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

// ─── ScheduleCard styles ──────────────────────────────────────────────────────

const sc = StyleSheet.create({
  card: {
    borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  repeatText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a', lineHeight: 22 },
  asset: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  sublabel: { fontSize: 12, fontWeight: '600' },
  datesRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  dateItem: { gap: 2 },
  dateLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' },
  dateValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  progressSection: { gap: 4 },
  progressTrack: {
    height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
  btn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  btnBlocked: { backgroundColor: '#e5e7eb' },
  btnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

const exec = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  progressBar: { height: 4, backgroundColor: '#e2e8f0' },
  progressFill: { height: 4, backgroundColor: '#2563eb', borderRadius: 2 },

  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },

  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  questionNum: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  questionNumText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  questionText: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 22 },
  questionDesc: { fontSize: 13, color: '#6b7280', lineHeight: 18 },

  answerRow: { flexDirection: 'row', gap: 10 },
  answerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  answerYes: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  answerNo: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  answerBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  noteInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fafafa',
    minHeight: 80,
  },

  navRow: { flexDirection: 'row', gap: 10 },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    alignItems: 'center',
  },
  navBtnDisabled: { borderColor: '#e2e8f0' },
  navBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  navBtnNext: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  navBtnFinish: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  navBtnNextText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e2e8f0' },
  dotActive: { backgroundColor: '#2563eb', transform: [{ scale: 1.3 }] },
  dotAnswered: { backgroundColor: '#86efac' },

  // Summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: '#6b7280', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  scoreText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  scorePill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },

  // Done screen
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
    backgroundColor: '#fff',
  },
  doneEmoji: { fontSize: 72 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center' },
  scoreDisplay: { alignItems: 'center' },
  scoreDisplayValue: { fontSize: 48, fontWeight: '900', color: '#2563eb' },
  scoreDisplayLabel: { fontSize: 14, color: '#6b7280', marginTop: -4 },
  scoreMsg: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  offlineNotice: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  offlineNoticeText: { fontSize: 13, color: '#1e40af', lineHeight: 18, textAlign: 'center' },
  doneBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
});
