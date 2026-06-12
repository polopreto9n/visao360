import axios, { AxiosError, AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Lê da config do Expo (injetada via app.config.js no build)
// Fallback para env var e depois para IP de desenvolvimento
const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://192.168.0.190:3001/api/v1';

console.log('[Visão360] API URL:', API_BASE_URL);
const TOKEN_KEY = 'visao360_token';
const REFRESH_KEY = 'visao360_refresh';
const USER_KEY = 'visao360_user';

// Instância sem interceptor para o refresh (evita loop infinito)
const rawApi = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Injeta o JWT em todas as requests
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: { resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => error ? p.reject(error) : p.resolve(token!));
  failedQueue = [];
}

// Interceptor de resposta — tenta refresh automático no 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message: string; statusCode: number }> & { config?: { _retry?: boolean } }) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) {
      // Sem refresh token — limpa sessão
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const res = await rawApi.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = res.data;
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_KEY, newRefreshToken);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      original.headers.Authorization = `Bearer ${accessToken}`;
      processQueue(null, accessToken);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  company: Company;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export const authApi = {
  findCompanies: (email: string) =>
    api.get<Company[]>('/auth/find-companies', { params: { email } }),

  login: (email: string, password: string, companyId: string) =>
    api.post<LoginResponse>('/auth/login', { email, password, companyId }),

  me: () => api.get<AuthUser>('/auth/me'),
};

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  code: string | null;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  qrCode: string;
  status: string;
  installDate: string | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  description: string | null;
  unit: { id: string; name: string };
}

export interface AssetExecution {
  id: string;
  score: number | null;
  completedAt: string | null;
  notes: string | null;
  checklist: { id: string; name: string; type: string };
  user: { id: string; name: string };
}

export interface AssetWorkOrder {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  completedAt: string | null;
  assignee: { id: string; name: string } | null;
}

export interface AssetHistory {
  executions: AssetExecution[];
  workOrders: AssetWorkOrder[];
}

export const assetsApi = {
  findByQRCode: (qrCode: string) => api.get<Asset>(`/assets/qr/${qrCode}`),
  list: (page = 1, limit = 20) =>
    api.get<{ data: Asset[]; total: number }>('/assets', { params: { page, limit } }),
  getChecklists: (assetId: string) =>
    api.get<Checklist[]>(`/assets/${assetId}/checklists`),
  getHistory: (assetId: string) =>
    api.get<AssetHistory>(`/assets/${assetId}/history`),
  updateStatus: (assetId: string, status: string) =>
    api.patch<Asset>(`/assets/${assetId}/status`, { status }),
};

// ─── Checklists ───────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  order: number;
  question: string;
  description: string | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
  expectedAnswer: boolean;
}

export interface Checklist {
  id: string;
  name: string;
  description: string | null;
  type: string;
  intervalDays: number | null;
  items: ChecklistItem[];
  unit: { id: string; name: string } | null;
  asset: { id: string; name: string } | null;
  _count?: { executions: number };
}

export interface ExecutionItemPayload {
  checklistItemId: string;
  answer: boolean;
  notes?: string;
  photoUrl?: string;
}

export interface StartExecutionResponse {
  id: string;
  checklistId: string;
  status: string;
  startedAt: string;
}

export const checklistsApi = {
  list: () => api.get<{ data: Checklist[]; total: number }>('/checklists'),
  getById: (id: string) => api.get<Checklist>(`/checklists/${id}`),
  startExecution: (checklistId: string, assetId?: string) =>
    api.post<StartExecutionResponse & { checklist: Checklist }>('/executions', { checklistId, assetId }),
  submitExecution: (
    executionId: string,
    items: ExecutionItemPayload[],
    notes?: string,
    signatureUrl?: string,
  ) => api.patch(`/executions/${executionId}/complete`, { items, notes, signatureUrl }),
};

// ─── Work Orders ──────────────────────────────────────────────────────────────

export interface WorkOrder {
  id: string;
  code: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  asset: { id: string; name: string } | null;
  unit: { id: string; name: string };
  creator: { id: string; name: string };
}

export const workOrdersApi = {
  myOrders: () => api.get<WorkOrder[]>('/work-orders/my'),
  create: (data: {
    title: string;
    description?: string;
    unitId: string;
    assetId?: string;
    priority?: string;
    photoUrls?: string[];
  }) => api.post<WorkOrder>('/work-orders', data),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/work-orders/${id}/status`, { status, notes }),
};

// ─── Checklist Schedules ──────────────────────────────────────────────────────

export interface ChecklistSchedule {
  id: string;
  name: string | null;
  nextDueAt: string;
  repeatDays: number | null;
  reminderDaysBefore: number | null;
  releaseBeforeDays: number | null;
  toleranceDays: number | null;
  isActive: boolean;
  checklist: { id: string; name: string; type: string };
  asset: { id: string; name: string; code: string | null } | null;
  assignee: { id: string; name: string } | null;
}

export const schedulesApi = {
  mine: () => api.get<ChecklistSchedule[]>('/checklist-schedules/mine'),
};

// ─── Units ────────────────────────────────────────────────────────────────────

export interface Unit {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
}

export const unitsApi = {
  list: () => api.get<{ data: Unit[]; total: number }>('/units'),
};

// ─── Ocorrências (Incidents) ─────────────────────────────────────────────────

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  photoUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
  unit: { id: string; name: string };
  reporter: { id: string; name: string; email: string };
}

export const incidentsApi = {
  list: (params?: { status?: string; limit?: number }) =>
    api.get<{ data: Incident[]; total: number }>('/incidents', { params: { limit: 50, ...params } }),
  create: (data: { title: string; description: string; unitId: string; severity?: string; photoUrls?: string[] }) =>
    api.post<Incident>('/incidents', data),
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadApi = {
  uploadPhoto: async (uri: string, folder = 'executions') => {
    const filename = uri.split('/').pop() ?? 'photo.jpg';
    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: 'image/jpeg' } as unknown as Blob);
    formData.append('folder', folder);

    const response = await api.post<{ url: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.url;
  },
};
