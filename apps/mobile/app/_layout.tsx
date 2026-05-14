import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useOfflineStore } from '../stores/offline.store';
import { useNetwork } from '../hooks/useNetwork';
import { OfflineBanner } from '../components/OfflineBanner';

export default function RootLayout() {
  const { syncAll, queue } = useOfflineStore();
  const { isOnline } = useNetwork();

  // Tenta sincronizar quando app volta ao foreground com conexão
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && isOnline && queue.length > 0) {
          syncAll().catch(() => {});
        }
      },
    );
    return () => subscription.remove();
  }, [isOnline, queue.length, syncAll]);

  // Sync inicial quando conectado e tem itens pendentes
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      const timer = setTimeout(() => {
        syncAll().catch(() => {});
      }, 3000); // aguarda 3s após inicialização
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />

      {/* Banner de status offline/sync (overlay no topo) */}
      <OfflineBanner />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
