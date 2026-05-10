import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// Instância sem interceptor (usada para refresh — evita loop infinito)
const rawApi = axios.create({ baseURL: API_URL, timeout: 10000 });

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('visao360_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError & { config?: InternalAxiosRequestConfig & { _retry?: boolean } }) => {
    const original = err.config;
    if (err.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(err);
    }

    if (typeof window === 'undefined') return Promise.reject(err);

    const refreshToken = localStorage.getItem('visao360_refresh');
    if (!refreshToken) {
      localStorage.removeItem('visao360_token');
      localStorage.removeItem('visao360_user');
      window.location.href = '/login';
      return Promise.reject(err);
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
      const res = await rawApi.post<{ accessToken: string }>('/auth/refresh', { refreshToken });
      const { accessToken } = res.data;
      localStorage.setItem('visao360_token', accessToken);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      original.headers.Authorization = `Bearer ${accessToken}`;
      processQueue(null, accessToken);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      localStorage.removeItem('visao360_token');
      localStorage.removeItem('visao360_refresh');
      localStorage.removeItem('visao360_user');
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string; name: string; email: string; role: string;
  companyId: string; company: { id: string; name: string; logoUrl: string | null };
}

export interface Paginated<T> {
  data: T[]; total: number; page: number; limit: number; totalPages: number;
}

export interface Company {
  id: string; name: string; cnpj: string | null; email: string;
  phone: string | null; address: string | null; logoUrl: string | null;
  _count: { users: number; units: number; assets: number };
}

export interface CompanyStats {
  users: number; units: number; assets: number;
  openWorkOrders: number; openIncidents: number;
}

export interface Unit {
  id: string; name: string; code: string | null; address: string | null;
  isActive: boolean; _count: { assets: number; checklists: number };
}

export interface Asset {
  id: string; name: string; code: string | null; category: string;
  brand: string | null; model: string | null; serialNumber: string | null;
  qrCode: string; status: string; installDate: string | null;
  lastMaintenanceAt: string | null; nextMaintenanceAt: string | null;
  description: string | null; photoUrl: string | null;
  unit: { id: string; name: string };
}

export interface ChecklistItem {
  id: string; order: number; question: string;
  description: string | null; requiresPhoto: boolean; requiresNote: boolean;
}

export interface Checklist {
  id: string; name: string; description: string | null; type: string;
  intervalDays: number | null; isActive: boolean;
  items: ChecklistItem[];
  unit: { id: string; name: string } | null;
  asset: { id: string; name: string } | null;
  _count?: { executions: number };
}

export interface Execution {
  id: string; status: string; score: number | null;
  startedAt: string | null; completedAt: string | null;
  checklist: { id: string; name: string; type: string };
  user: { id: string; name: string };
  asset: { id: string; name: string } | null;
  _count: { items: number };
}

export interface WorkOrder {
  id: string; code: string; title: string; description: string;
  status: string; priority: string; dueDate: string | null;
  startedAt: string | null; completedAt: string | null; notes: string | null;
  unit: { id: string; name: string };
  asset: { id: string; name: string; qrCode: string } | null;
  creator: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
}

export interface DashboardKPIs {
  summary: {
    totalAssets: number; activeAssets: number; assetsInMaintenance: number;
    totalWorkOrders: number; openWorkOrders: number; inProgressWorkOrders: number;
    overdueWorkOrders: number; completedThisMonth: number;
    checklistsThisMonth: number; checklistCompletionRate: number;
    openIncidents: number; criticalIncidents: number;
  };
  charts: {
    assetsByStatus: { status: string; count: number }[];
    woByPriority: { priority: string; count: number }[];
  };
  recentActivity: { executions: Execution[]; workOrders: WorkOrder[] };
  alerts: { assetsNeedingMaintenance: (Asset & { isOverdue: boolean })[] };
}

export interface User {
  id: string; name: string; email: string; role: string;
  phone: string | null; isActive: boolean; lastLoginAt: string | null;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const authApi = {
  findCompanies: (email: string) =>
    api.get<{ id: string; name: string; logoUrl: string | null; isActive: boolean }[]>(
      `/auth/find-companies`, { params: { email } }
    ),
  login: (email: string, password: string, companyId: string) =>
    api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password, companyId }),
  me: () => api.get<AuthUser>('/auth/me'),
};

export const dashboardApi = {
  kpis: () => api.get<DashboardKPIs>('/dashboard/kpis'),
};

export const assetsApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<Asset>>('/assets', { params }),
  get: (id: string) => api.get<Asset>(`/assets/${id}`),
  create: (data: Record<string, unknown>) => api.post<Asset>('/assets', data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Asset>(`/assets/${id}`, data),
  qrData: (id: string) => api.get<{ qrCode: string; qrData: string; dataUrl: string }>(`/assets/${id}/qr-data`),
  qrImageUrl: (id: string) => `${API_URL}/assets/${id}/qr-image`,
};

export const checklistsApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<Checklist>>('/checklists', { params }),
  get: (id: string) => api.get<Checklist>(`/checklists/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put<Checklist>(`/checklists/${id}`, data),
  remove: (id: string) => api.delete(`/checklists/${id}`),
  start: (checklistId: string, assetId?: string) =>
    api.post<{ id: string; status: string; checklist: Checklist }>('/executions', { checklistId, assetId }),
  complete: (execId: string, items: unknown[], notes?: string, signatureUrl?: string) =>
    api.patch(`/executions/${execId}/complete`, { items, notes, signatureUrl }),
  executions: (params?: Record<string, unknown>) => api.get<Paginated<Execution>>('/executions', { params }),
};

export const workOrdersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<WorkOrder>>('/work-orders', { params }),
  get: (id: string) => api.get<WorkOrder>(`/work-orders/${id}`),
  my: () => api.get<WorkOrder[]>('/work-orders/my'),
  create: (data: Record<string, unknown>) => api.post<WorkOrder>('/work-orders', data),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch<WorkOrder>(`/work-orders/${id}/status`, { status, notes }),
  assign: (id: string, assigneeId: string) =>
    api.patch<WorkOrder>(`/work-orders/${id}/assign/${assigneeId}`),
};

export const usersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<User>>('/users', { params }),
};

export const unitsApi = {
  list: () => api.get<Paginated<Unit>>('/units'),
};

export const companiesApi = {
  me: () => api.get<Company>('/companies/me'),
};
