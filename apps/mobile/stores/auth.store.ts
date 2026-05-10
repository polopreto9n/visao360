import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi, AuthUser, Company } from '../services/api';

const TOKEN_KEY = 'visao360_token';
const USER_KEY = 'visao360_user';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  companies: Company[];
  isLoading: boolean;
  error: string | null;

  // Actions
  findCompanies: (email: string) => Promise<Company[]>;
  login: (email: string, password: string, companyId: string) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  companies: [],
  isLoading: false,
  error: null,

  findCompanies: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.findCompanies(email);
      const companies = Array.isArray(response.data) ? response.data : [response.data];
      if (companies.length === 0) {
        set({ error: 'Nenhuma empresa encontrada para este e-mail.', isLoading: false });
        return [];
      }
      set({ companies, isLoading: false });
      return companies;
    } catch (err: unknown) {
      const isNetworkError =
        String(err).includes('Network') ||
        String(err).includes('ECONNREFUSED') ||
        String(err).includes('timeout');
      const msg = isNetworkError
        ? `Sem conexão com o servidor.\nVerifique se está na mesma rede Wi-Fi.\nAPI: ${process.env.EXPO_PUBLIC_API_URL ?? 'não configurada'}`
        : 'Nenhuma empresa encontrada para este e-mail.';
      set({ error: msg, isLoading: false });
      return [];
    }
  },

  login: async (email: string, password: string, companyId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password, companyId);
      const { accessToken, refreshToken, user } = response.data as {
        accessToken: string; refreshToken?: string; user: typeof response.data.user;
      };

      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      if (refreshToken) await SecureStore.setItemAsync('visao360_refresh', refreshToken);

      set({ token: accessToken, user, isLoading: false });

      // Registrar push token em background (sem bloquear o login)
      void import('expo-notifications').then(async (Notifications) => {
        try {
          const { status } = await Notifications.getPermissionsAsync();
          const finalStatus = status === 'granted'
            ? status
            : (await Notifications.requestPermissionsAsync()).status;
          if (finalStatus !== 'granted') return;
          const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();
          await import('../services/api').then(({ api }) =>
            api.post('/push/register', { token: expoPushToken, platform: 'expo' })
          );
        } catch { /* silencioso — push não crítico */ }
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Credenciais inválidas';
      set({ error: String(message), isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null, companies: [] });
  },

  loadFromStorage: async () => {
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (token && userJson) {
        set({ token, user: JSON.parse(userJson) as AuthUser });
      }
    } catch {
      // SecureStore falhou — tratar como não autenticado
    }
  },

  clearError: () => set({ error: null }),
}));
