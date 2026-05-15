'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { incidentsApi, unitsApi, uploadApi, Incident, Unit } from '../../services/api';
import { PhotoCapture } from '../../components/PhotoCapture';

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  CRITICAL: { label: 'Crítica',  color: '#dc2626', bg: '#fee2e2', emoji: '🚨' },
  HIGH:     { label: 'Alta',     color: '#ea580c', bg: '#ffedd5', emoji: '🔴' },
  MEDIUM:   { label: 'Média',   color: '#d97706', bg: '#fef9c3', emoji: '🟡' },
  LOW:      { label: 'Baixa',   color: '#16a34a', bg: '#dcfce7', emoji: '🟢' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  OPEN:         { label: 'Aberta',       color: '#dc2626' },
  INVESTIGATING:{ label: 'Investigando', color: '#d97706' },
  RESOLVED:     { label: 'Resolvida',    color: '#16a34a' },
  CLOSED:       { label: 'Encerrada',    color: '#6b7280' },
};

export default function IncidentsScreen() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const res = await incidentsApi.list(params);
      setIncidents(res.data.data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as ocorrências.');
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const FILTERS = [
    { key: '', label: 'Todas' },
    { key: 'OPEN', label: 'Abertas' },
    { key: 'INVESTIGATING', label: 'Investigando' },
    { key: 'RESOLVED', label: 'Resolvidas' },
  ];

  return (
    <View style={s.container}>
      {/* Filtros */}
      <View style={s.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[s.filterPill, filter === f.key && s.filterPillActive]}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={s.emptyTitle}>Nenhuma ocorrência</Text>
              <Text style={s.emptySub}>Registre problemas usando o botão abaixo</Text>
            </View>
          }
          renderItem={({ item }) => {
            const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.MEDIUM;
            const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.OPEN;
            return (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.sevBadge, { backgroundColor: sev.bg }]}>
                    <Text style={[s.sevText, { color: sev.color }]}>{sev.emoji} {sev.label}</Text>
                  </View>
                  <View style={[s.statusDot, { backgroundColor: st.color }]} />
                  <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                <View style={s.cardFooter}>
                  <Text style={s.cardMeta}>🏢 {item.unit.name}</Text>
                  <Text style={s.cardMeta}>👤 {item.reporter.name}</Text>
                  {item.photoUrls.length > 0 && (
                    <Text style={s.cardMeta}>📷 {item.photoUrls.length} foto(s)</Text>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Botão nova ocorrência */}
      <TouchableOpacity style={s.fab} onPress={() => setCreating(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal criar ocorrência */}
      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet">
        <CreateIncidentForm
          onClose={() => { setCreating(false); load(); }}
        />
      </Modal>
    </View>
  );
}

// ─── Formulário de criação ───────────────────────────────────────────────────

function CreateIncidentForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    unitsApi.list().then((r) => {
      setUnits(r.data.data);
      if (r.data.data.length > 0) setUnitId(r.data.data[0].id);
    }).catch(() => {});
  }, []);

  async function submit() {
    if (!title.trim()) { Alert.alert('Atenção', 'Informe o título da ocorrência.'); return; }
    if (!description.trim()) { Alert.alert('Atenção', 'Descreva a ocorrência.'); return; }
    if (!unitId) { Alert.alert('Atenção', 'Selecione a unidade.'); return; }

    setSubmitting(true);
    try {
      // Upload das fotos
      const photoUrls: string[] = [];
      for (const uri of photos) {
        try {
          const url = await uploadApi.uploadPhoto(uri, 'incidents');
          photoUrls.push(url);
        } catch { /* ignora falha de upload individual */ }
      }

      await incidentsApi.create({ title: title.trim(), description: description.trim(), unitId, severity, photoUrls });
      Alert.alert('✅ Ocorrência registrada', 'A administração foi notificada.', [{ text: 'OK', onPress: onClose }]);
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar a ocorrência. Tente novamente.');
    } finally { setSubmitting(false); }
  }

  const SEVERITIES: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <View style={f.header}>
        <TouchableOpacity onPress={onClose} style={f.closeBtn}>
          <Ionicons name="close" size={20} color="#6b7280" />
        </TouchableOpacity>
        <Text style={f.headerTitle}>Nova Ocorrência</Text>
        <TouchableOpacity onPress={submit} disabled={submitting} style={[f.submitBtn, submitting && { opacity: 0.6 }]}>
          <Text style={f.submitText}>{submitting ? 'Enviando...' : 'Enviar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={f.content}>
        {/* Título */}
        <View style={f.field}>
          <Text style={f.label}>Título *</Text>
          <TextInput
            style={f.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Vazamento no corredor"
            placeholderTextColor="#9ca3af"
            maxLength={200}
          />
        </View>

        {/* Descrição */}
        <View style={f.field}>
          <Text style={f.label}>Descrição *</Text>
          <TextInput
            style={[f.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Descreva o problema em detalhes..."
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
          />
        </View>

        {/* Gravidade */}
        <View style={f.field}>
          <Text style={f.label}>Gravidade</Text>
          <View style={f.sevRow}>
            {SEVERITIES.map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <TouchableOpacity
                  key={sev}
                  onPress={() => setSeverity(sev)}
                  style={[f.sevBtn, { borderColor: cfg.color }, severity === sev && { backgroundColor: cfg.bg }]}
                >
                  <Text style={{ fontSize: 16 }}>{cfg.emoji}</Text>
                  <Text style={[f.sevLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Unidade */}
        <View style={f.field}>
          <Text style={f.label}>Unidade *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
              {units.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setUnitId(u.id)}
                  style={[f.unitPill, unitId === u.id && f.unitPillActive]}
                >
                  <Text style={[f.unitText, unitId === u.id && f.unitTextActive]}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Fotos */}
        <View style={f.field}>
          <Text style={f.label}>Fotos (opcional)</Text>
          <PhotoCapture
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
            label="Adicionar foto da ocorrência"
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filtersRow: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  filterPillActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterTextActive: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sevBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  sevText: { fontSize: 12, fontWeight: '700' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 'auto' },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#9ca3af' },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
});

const f = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 20, paddingBottom: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827' },
  submitBtn: { backgroundColor: '#dc2626', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  content: { padding: 16, gap: 20 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111827',
  },
  sevRow: { flexDirection: 'row', gap: 8 },
  sevBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff', gap: 4,
  },
  sevLabel: { fontSize: 11, fontWeight: '700' },
  unitPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  unitPillActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  unitText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  unitTextActive: { color: '#fff' },
});
