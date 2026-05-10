import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

interface NetworkState {
  isOnline: boolean;
  isChecking: boolean;
}

export function useNetwork(): NetworkState & { checkNow: () => Promise<boolean> } {
  const [state, setState] = useState<NetworkState>({ isOnline: true, isChecking: false });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const check = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, isChecking: true }));
    try {
      const net = await Network.getNetworkStateAsync();
      const online = Boolean(net.isConnected && net.isInternetReachable);
      setState({ isOnline: online, isChecking: false });
      return online;
    } catch {
      setState({ isOnline: false, isChecking: false });
      return false;
    }
  }, []);

  useEffect(() => {
    check();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        check();
      }
      appStateRef.current = nextState;
    });

    // Checa a cada 30 segundos enquanto app está ativo
    const interval = setInterval(check, 30_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [check]);

  return { ...state, checkNow: check };
}
