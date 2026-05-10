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

// Trata erros globalmente
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message: string; statusCode: number }>) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    return Promise.reject(error);
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
  qrCode: string;
  status: string;
  nextMaintenanceAt: string | null;
  unit: { id: string; name: string };
}

export const assetsApi = {
  findByQRCode: (qrCode: string) => api.get<Asset>(`/assets/qr/${qrCode}`),
  list: (page = 1, limit = 20) =>
    api.get<{ data: Asset[]; total: number }>('/assets', { params: { page, limit } }),
};

// ─── Checklists ───────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  order: number;
  question: string;
  description: string | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
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
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/work-orders/${id}/status`, { status, notes }),
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
