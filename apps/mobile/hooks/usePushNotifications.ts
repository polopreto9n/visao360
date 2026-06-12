import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { api } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    registerForPush();

    // Listener de notificação recebida enquanto o app está aberto
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // badge atualizado automaticamente
    });

    // Listener de toque na notificação
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data?.screen === 'checklist') {
        if (data.assetId) {
          router.push('/(tabs)/scan');
        } else {
          router.push('/(tabs)/checklists');
        }
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}

async function registerForPush() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('visao360', {
        name: 'Visão360',
        description: 'Alertas de checklists, manutenções e ordens de serviço',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#2563eb',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    console.log('[Push] Permission status:', existing);

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied:', finalStatus);
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    console.log('[Push] Getting token for projectId:', projectId);

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[Push] Token obtained:', token?.substring(0, 30));

    const response = await api.post('/push/register', { token, platform: Platform.OS });
    console.log('[Push] Registered:', response.status);
  } catch (err) {
    console.error('[Push] Registration failed:', err instanceof Error ? err.message : String(err));
  }
}
