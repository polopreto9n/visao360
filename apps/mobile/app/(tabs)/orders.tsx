import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { workOrdersApi, WorkOrder, uploadApi } from '../../services/api';
import { PhotoCapture } from '../../components/PhotoCapture';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'Aberta', color: '#2563eb', bg: '#dbeafe' },
  ASSIGNED: { label: 'Atribuída', color: '#7c3aed', bg: '#ede9fe' },
  IN_PROGRESS: { label: 'Em andamento', color: '#d97706', bg: '#fef3c7' },
  WAITING_PARTS: { label: 'Aguard. peças', color: '#ea580c', bg: '#ffedd5' },
  COMPLETED: { label: 'Concluída', color: '#16a34a', bg: '#dcfce7' },
  CANCELLED: { label: 'Cancelada', color: '#6b7280', bg: '#f3f4f6' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Baixa', color: '#16a34a' },
  MEDIUM: { label: 'Média', color: '#d97706' },
  HIGH: { label: 'Alta', color: '#ea580c' },
  CRITICAL: { label: 'Crítica', color: '#dc2626' },
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [completing, setCompleting] = useState<WorkOrder | null>(null);

  async function load() {
    try {
      const res = await workOrdersApi.myOrders();
      setOrders(res.data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(order: WorkOrder, newStatus: string) {
    try {
      await workOrdersApi.updateStatus(order.id, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)),
      );
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a OS.');
    }
  }

  function showActions(order: WorkOrder) {
    const transitions: Record<string, string[]> = {
      ASSIGNED: ['IN_PROGRESS'],
      IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
      WAITING_PARTS: ['IN_PROGRESS'],
    };
    const available = transitions[order.status];
    if (!available?.length) return;

    const labels: Record<string, string> = {
      IN_PROGRESS: 'Iniciar atendimento',
      WAITING_PARTS: 'Aguardando peças',
      COMPLETED: 'Marcar como concluída',
    };

    Alert.alert(
      `OS ${order.code}`,
      'Atualizar status:',
      [
        ...available.map((s) => ({
          text: labels[s] ?? s,
          onPress: () => (s === 'COMPLETED' ? setCompleting(order) : updateStatus(order, s)),
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ],
    );
  }

  function handleCompleted(order: WorkOrder) {
    setCompleting(null);
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: 'COMPLETED' } : o)),
    );
  }

  const displayed = filter === 'active'
    ? orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status))
    : orders;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={s.container}>
      {/* Filtro */}
      <View style={s.filterRow}>
        {(['active', 'all'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterBtnText, filter === f && s.filterBtnTextActive]}>
              {f === 'active' ? 'Ativas' : 'Todas'}{' '}
              <Text style={s.filterCount}>
                ({f === 'active'
                  ? orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length
                  : orders.length})
              </Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshing={loading}
        onRefresh={load}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="construct-outline" size={56} color="#cbd5e1" />
            <Text style={s.emptyTitle}>Nenhuma OS encontrada</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.OPEN;
          const pr = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.MEDIUM;
          const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();

          return (
            <TouchableOpacity style={s.card} onPress={() => showActions(item)}>
              <View style={s.cardTop}>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
                <Text style={[s.priority, { color: pr.color }]}>● {pr.label}</Text>
              </View>

              <Text style={s.code}>{item.code}</Text>
              <Text style={s.title}>{item.title}</Text>

              <View style={s.meta}>
                <View style={s.metaItem}>
                  <Ionicons name="business-outline" size={13} color="#6b7280" />
                  <Text style={s.metaText}>{item.unit.name}</Text>
                </View>
                {item.asset && (
                  <View style={s.metaItem}>
                    <Ionicons name="hardware-chip-outline" size={13} color="#6b7280" />
                    <Text style={s.metaText}>{item.asset.name}</Text>
                  </View>
                )}
                {item.dueDate && (
                  <View style={s.metaItem}>
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={isOverdue ? '#dc2626' : '#6b7280'}
                    />
                    <Text style={[s.metaText, isOverdue && { color: '#dc2626', fontWeight: '700' }]}>
                      {isOverdue ? 'VENCIDA — ' : ''}
                      {new Date(item.dueDate).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                )}
              </View>

              {!['COMPLETED', 'CANCELLED'].includes(item.status) && (
                <View style={s.tapHint}>
                  <Text style={s.tapHintText}>Toque para atualizar status</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Modal concluir OS */}
      <Modal visible={!!completing} animationType="slide" presentationStyle="pageSheet">
        {completing && (
          <CompleteOrderForm
            order={completing}
            onClose={() => setCompleting(null)}
            onCompleted={() => handleCompleted(completing)}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Formulário de conclusão ─────────────────────────────────────────────────

function CompleteOrderForm({
  order,
  onClose,
  onCompleted,
}: {
  order: WorkOrder;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!notes.trim()) { Alert.alert('Atenção', 'Descreva o serviço realizado.'); return; }
    if (photos.length === 0) { Alert.alert('Atenção', 'Adicione ao menos uma foto do serviço concluído.'); return; }

    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (const uri of photos) {
        try {
          const url = await uploadApi.uploadPhoto(uri, 'work-orders');
          photoUrls.push(url);
        } catch { /* ignora falha de upload individual */ }
      }
      if (photoUrls.length === 0) {
        Alert.alert('Erro', 'Não foi possível enviar as fotos. Tente novamente.');
        return;
      }

      await workOrdersApi.updateStatus(order.id, 'COMPLETED', notes.trim(), { photoUrls });
      Alert.alert('✅ OS concluída', 'A OS foi marcada como concluída.', [{ text: 'OK', onPress: onCompleted }]);
    } catch {
      Alert.alert('Erro', 'Não foi possível concluir a OS. Tente novamente.');
    } finally { setSubmitting(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={f.header}>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color="#6b7280" />
        </TouchableOpacity>
        <Text style={f.headerTitle}>Concluir OS</Text>
        <TouchableOpacity onPress={submit} disabled={submitting} style={[f.submitBtn, submitting && { opacity: 0.6 }]}>
          <Text style={f.submitText}>{submitting ? 'Enviando...' : 'Concluir'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={f.content}>
        <View style={f.field}>
          <Text style={f.label}>{order.code} — {order.title}</Text>
        </View>

        <View style={f.field}>
          <Text style={f.label}>O que foi feito? *</Text>
          <TextInput
            style={[f.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Descreva o serviço realizado..."
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
          />
        </View>

        <View style={f.field}>
          <Text style={f.label}>Fotos do serviço concluído *</Text>
          <PhotoCapture
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
            label="Adicionar foto"
            required
          />
        </View>
      </ScrollView>
    </View>
  );
}

const f = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  submitBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  content: { padding: 16, gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  filterRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  filterBtnActive: { backgroundColor: '#2563eb' },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  filterBtnTextActive: { color: '#fff' },
  filterCount: { fontWeight: '400' },

  list: { padding: 12, gap: 10 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6b7280' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  priority: { fontSize: 12, fontWeight: '600' },
  code: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meta: { gap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: '#6b7280' },
  tapHint: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  tapHintText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
});
