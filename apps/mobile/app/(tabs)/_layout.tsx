import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePushNotifications } from '../../hooks/usePushNotifications';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  usePushNotifications();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1e40af' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          paddingBottom: 4,
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Início',
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scanner QR',
          tabBarLabel: 'Scanner',
          tabBarIcon: ({ color }) => <TabIcon name="qr-code-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="checklists"
        options={{
          title: 'Checklists',
          tabBarLabel: 'Checklists',
          tabBarIcon: ({ color }) => <TabIcon name="clipboard-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Ordens de Serviço',
          tabBarLabel: 'OS',
          tabBarIcon: ({ color }) => <TabIcon name="construct-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: 'Ocorrências',
          tabBarLabel: 'Ocorrências',
          tabBarIcon: ({ color }) => <TabIcon name="warning-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
