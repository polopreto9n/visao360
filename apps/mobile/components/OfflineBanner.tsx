import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useOfflineStore } from '../stores/offline.store';
import { useNetwork } from '../hooks/useNetwork';

export function OfflineBanner() {
  const { isOnline, isChecking } = useNetwork();
  const { queue, syncStatus, syncAll, lastSyncAt } = useOfflineStore();
  const pendingCount = queue.length;
  const translateY = useRef(new Animated.Value(-80)).current;

  const shouldShow = !isOnline || pendingCount > 0;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  }, [shouldShow]);

  // Auto-sync quando volta a ficar online e tem itens na fila
  useEffect(() => {
    if (isOnline && pendingCount > 0 && syncStatus === 'idle') {
      syncAll();
    }
  }, [isOnline, pendingCount, syncStatus]);

  if (!shouldShow) return null;

  return (
    <Animated.View style={[s.container, { transform: [{ translateY }] }]}>
      {!isOnline ? (
        <View style={[s.band, s.offline]}>
          <Text style={s.icon}>📵</Text>
          <View style={s.texts}>
            <Text style={s.title}>Sem conexão</Text>
            <Text style={s.sub}>
              {pendingCount > 0
                ? `${pendingCount} item(ns) serão sincronizados quando reconectar`
                : 'As ações serão sincronizadas ao reconectar'}
            </Text>
          </View>
        </View>
      ) : pendingCount > 0 ? (
        <View style={[s.band, s.syncing]}>
          {syncStatus === 'syncing' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.icon}>☁️</Text>
          )}
          <View style={s.texts}>
            <Text style={s.title}>
              {syncStatus === 'syncing'
                ? 'Sincronizando...'
                : `${pendingCount} item(ns) pendente(s)`}
            </Text>
            {syncStatus !== 'syncing' && (
              <Text style={s.sub}>Toque para sincronizar agora</Text>
            )}
          </View>
          {syncStatus !== 'syncing' && (
            <TouchableOpacity style={s.syncBtn} onPress={syncAll}>
              <Text style={s.syncBtnText}>Sync</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },

  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 50, // safe area
  },

  offline: { backgroundColor: '#dc2626' },
  syncing: { backgroundColor: '#2563eb' },

  icon: { fontSize: 18 },

  texts: { flex: 1 },

  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 1,
  },

  syncBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  syncBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});
