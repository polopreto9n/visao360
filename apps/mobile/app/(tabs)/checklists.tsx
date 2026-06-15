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
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checklistsApi, schedulesApi, Checklist, ChecklistSchedule } from '../../services/api';
import { useOfflineStore } from '../../stores/offline.store';
import { useNetwork } from '../../hooks/useNetwork';
import { ExecutionFlow } from '../../components/ChecklistExecutionFlow';
import { getScheduleStatus, ScheduleStatus, ScheduleStatusResult } from '../../utils/scheduleStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  const [refreshing, setRefreshing] = useState(false);
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

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Mapeia checklistId → schedule para lookup rápido
  const scheduleByChecklistId = Object.fromEntries(
    schedules.map((s) => [s.checklist.id, s]),
  );

  // Calcula status de cada agenda
  const schedulesWithStatus = schedules.map((sch) => ({
    sch,
    st: getScheduleStatus(sch),
  }));

  // Ordem de urgência para ordenação da agenda (mais urgente primeiro)
  const STATUS_PRIORITY: Record<ScheduleStatus, number> = {
    OVERDUE: 0,
    DUE_SOON: 1,
    AVAILABLE: 2,
    BLOCKED: 3,
    EXPIRED: 4,
    NO_SCHEDULE: 5,
  };

  // Filtra agendas pela tab ativa e ordena por urgência
  const filteredSchedules = schedulesWithStatus
    .filter(({ st }) => {
      if (filterTab === 'available') return st.canExecute && (st.status === 'AVAILABLE' || st.status === 'DUE_SOON');
      if (filterTab === 'overdue') return st.status === 'OVERDUE' || st.status === 'EXPIRED';
      if (filterTab === 'blocked') return st.status === 'BLOCKED';
      return true;
    })
    .sort((a, b) => {
      const prioDiff = STATUS_PRIORITY[a.st.status] - STATUS_PRIORITY[b.st.status];
      if (prioDiff !== 0) return prioDiff;

      // Dentro do mesmo status: mais atrasado ou mais próximo do vencimento primeiro
      if (a.st.status === 'OVERDUE') {
        return (b.st.daysOverdue ?? 0) - (a.st.daysOverdue ?? 0);
      }
      return (a.st.daysToDue ?? Infinity) - (b.st.daysToDue ?? Infinity);
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
      const res = await checklistsApi.startExecution(cl.id, cl.asset?.id);
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

