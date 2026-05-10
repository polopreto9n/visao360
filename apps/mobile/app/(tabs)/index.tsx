import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth.store';
import { workOrdersApi, checklistsApi, WorkOrder, Checklist } from '../../services/api';

interface KPI {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [myOrders, setMyOrders] = useState<WorkOrder[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [ordersRes, checkRes] = await Promise.allSettled([
        workOrdersApi.myOrders(),
        checklistsApi.list(),
      ]);

      if (ordersRes.status === 'fulfilled') setMyOrders(ordersRes.value.data);
      if (checkRes.status === 'fulfilled') setChecklists(checkRes.value.data.data);
    } catch {
      // Silencioso — dados de demo quando API não alcançável
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const openOrders = myOrders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
  const criticalOrders = myOrders.filter((o) => o.priority === 'CRITICAL');

  const kpis: KPI[] = [
    {
      label: 'OS Abertas',
      value: openOrders.length,
      icon: 'construct-outline',
      color: '#d97706',
      bg: '#fef3c7',
    },
    {
      label: 'OS Críticas',
      value: criticalOrders.length,
      icon: 'alert-circle-outline',
      color: '#dc2626',
      bg: '#fee2e2',
    },
    {
      label: 'Checklists',
      value: checklists.length,
      icon: 'clipboard-outline',
      color: '#2563eb',
      bg: '#dbeafe',
    },
    {
      label: 'Concluídas',
      value: myOrders.filter((o) => o.status === 'COMPLETED').length,
      icon: 'checkmark-circle-outline',
      color: '#16a34a',
      bg: '#dcfce7',
    },
  ];

  const firstName = user?.name.split(' ')[0] ?? 'Técnico';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {firstName} 👋</Text>
          <Text style={styles.company}>{user?.company.name}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/scan')} style={styles.scanBtn}>
          <Ionicons name="qr-code" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* KPIs */}
      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: kpi.bg }]}>
            <Ionicons name={kpi.icon} size={24} color={kpi.color} />
            <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* Minhas OS */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Minhas OS Abertas</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
            <Text style={styles.sectionLink}>Ver todas →</Text>
          </TouchableOpacity>
        </View>

        {openOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
            <Text style={styles.emptyText}>Nenhuma OS aberta</Text>
          </View>
        ) : (
          openOrders.slice(0, 3).map((order) => (
            <TouchableOpacity key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderCode}>{order.code}</Text>
                <PriorityBadge priority={order.priority} />
              </View>
              <Text style={styles.orderTitle} numberOfLines={1}>{order.title}</Text>
              <Text style={styles.orderUnit}>{order.unit.name}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Checklists rápidos */}
      <View style={[styles.section, { marginBottom: 32 }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Checklists Disponíveis</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/checklists')}>
            <Text style={styles.sectionLink}>Ver todos →</Text>
          </TouchableOpacity>
        </View>

        {checklists.slice(0, 2).map((cl) => (
          <TouchableOpacity
            key={cl.id}
            style={styles.checklistCard}
            onPress={() => router.push(`/(tabs)/checklists`)}
          >
            <Ionicons name="clipboard-outline" size={20} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={styles.checklistName}>{cl.name}</Text>
              <Text style={styles.checklistMeta}>{cl.items.length} itens</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    CRITICAL: { bg: '#fee2e2', text: '#dc2626', label: 'Crítica' },
    HIGH: { bg: '#ffedd5', text: '#ea580c', label: 'Alta' },
    MEDIUM: { bg: '#fef9c3', text: '#ca8a04', label: 'Média' },
    LOW: { bg: '#dcfce7', text: '#16a34a', label: 'Baixa' },
  };
  const cfg = colors[priority] ?? colors.MEDIUM;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#1e40af',
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#fff' },
  company: { fontSize: 13, color: '#93c5fd', marginTop: 2 },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: '44%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
    gap: 4,
  },
  kpiValue: { fontSize: 28, fontWeight: '800' },
  kpiLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionLink: { fontSize: 13, color: '#2563eb', fontWeight: '600' },

  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderCode: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  orderTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  orderUnit: { fontSize: 12, color: '#6b7280' },

  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  checklistName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  checklistMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: { fontSize: 14, color: '#6b7280' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
