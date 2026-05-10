import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth.store';

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN: { label: 'Administrador', color: '#7c3aed', bg: '#ede9fe' },
  GESTOR: { label: 'Gestor', color: '#2563eb', bg: '#dbeafe' },
  TECNICO: { label: 'Técnico', color: '#d97706', bg: '#fef3c7' },
  CLIENTE: { label: 'Cliente', color: '#16a34a', bg: '#dcfce7' },
};

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  function confirmLogout() {
    Alert.alert('Sair da conta', 'Deseja sair do Visão360?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  if (!user) return null;

  const roleConfig = ROLE_LABELS[user.role] ?? ROLE_LABELS.TECNICO;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Avatar */}
      <View style={s.avatarSection}>
        <View style={s.avatar}>
          <Text style={s.avatarLetter}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={s.name}>{user.name}</Text>
        <Text style={s.email}>{user.email}</Text>
        <View style={[s.roleBadge, { backgroundColor: roleConfig.bg }]}>
          <Text style={[s.roleText, { color: roleConfig.color }]}>{roleConfig.label}</Text>
        </View>
      </View>

      {/* Company */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Empresa</Text>
        <View style={s.infoRow}>
          <Ionicons name="business-outline" size={18} color="#6b7280" />
          <Text style={s.infoText}>{user.company.name}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Conta</Text>
        {[
          { icon: 'lock-closed-outline' as const, label: 'Alterar senha', onPress: () => {} },
          { icon: 'notifications-outline' as const, label: 'Notificações', onPress: () => {} },
          { icon: 'help-circle-outline' as const, label: 'Suporte', onPress: () => {} },
        ].map((item) => (
          <TouchableOpacity key={item.label} style={s.menuItem} onPress={item.onPress}>
            <Ionicons name={item.icon} size={20} color="#374151" />
            <Text style={s.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
          </TouchableOpacity>
        ))}
      </View>

      {/* App info */}
      <View style={s.appInfo}>
        <Text style={s.appInfoText}>Visão360 Mobile v1.0.0</Text>
        <Text style={s.appInfoText}>API: {process.env.EXPO_PUBLIC_API_URL ?? 'localhost:3001'}</Text>
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={s.logoutText}>Sair da conta</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 20, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarLetter: { fontSize: 40, fontWeight: '900', color: '#fff' },
  name: { fontSize: 20, fontWeight: '800', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280' },
  roleBadge: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 4,
  },
  roleText: { fontSize: 13, fontWeight: '700' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, color: '#111827', fontWeight: '500' },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#111827' },

  appInfo: { alignItems: 'center', gap: 4 },
  appInfoText: { fontSize: 12, color: '#9ca3af' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
});
