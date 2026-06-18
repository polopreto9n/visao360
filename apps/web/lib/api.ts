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

    // Subscription-related 401 → não tenta refresh, vai direto para recuperação
    const msg = (err.response?.data as { message?: string })?.message ?? '';
    const isSubscriptionBlock =
      msg.includes('suspensa') ||
      msg.includes('cancelada') ||
      msg.includes('avaliação encerrado');
    if (isSubscriptionBlock) {
      window.location.href = '/recuperar';
      return Promise.reject(err);
    }

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
      const res = await rawApi.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = res.data;
      localStorage.setItem('visao360_token', accessToken);
      localStorage.setItem('visao360_refresh', newRefreshToken);
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

export interface UnitUser {
  id: string; name: string; email: string; role: string; phone: string | null; isActive: boolean;
}

export interface Unit {
  id: string; name: string; code: string | null; address: string | null;
  description: string | null; isActive: boolean;
  users: UnitUser[];
  _count: { assets: number; checklists: number; workOrders?: number };
}

export interface UnitOption {
  id: string;
  name: string;
  code: string | null;
}

export const unitsApi = {
  list: () => api.get<Paginated<Unit>>('/units'),
  options: () => api.get<UnitOption[]>('/units/options'),
  assignUser: (unitId: string, userId: string) =>
    api.post<Unit>(`/units/${unitId}/users/${userId}`),
  removeUser: (unitId: string, userId: string) =>
    api.delete<Unit>(`/units/${unitId}/users/${userId}`),
};

export interface Supplier {
  id: string; name: string; category: string | null; phone: string | null;
  email: string | null; notes: string | null; isActive: boolean;
  _count?: { workOrders: number };
  workOrders?: { id: string; code: string; title: string; status: string; completedAt: string | null; cost: number | null }[];
}

export interface SupplierOption {
  id: string; name: string; category: string | null; phone: string | null;
}

export const suppliersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<Supplier>>('/suppliers', { params }),
  options: () => api.get<SupplierOption[]>('/suppliers/options'),
  get: (id: string) => api.get<Supplier>(`/suppliers/${id}`),
  create: (data: Record<string, unknown>) => api.post<Supplier>('/suppliers', data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Supplier>(`/suppliers/${id}`, data),
  remove: (id: string) => api.delete(`/suppliers/${id}`),
};

export interface Asset {
  id: string; name: string; code: string | null; category: string;
  brand: string | null; model: string | null; serialNumber: string | null;
  qrCode: string; status: string; installDate: string | null;
  lastMaintenanceAt: string | null; nextMaintenanceAt: string | null;
  warrantyUntil: string | null; contractUntil: string | null;
  description: string | null; photoUrl: string | null;
  unit: { id: string; name: string };
}

export interface RecurringIssueAsset {
  id: string; name: string; category: string; status: string;
  unit: { id: string; name: string };
  issueCount: number;
  workOrders: {
    id: string; code: string; title: string; status: string; priority: string;
    createdAt: string; completedAt: string | null;
  }[];
}

export interface ChecklistItem {
  id: string; order: number; question: string;
  description: string | null; requiresPhoto: boolean; requiresNote: boolean;
  expectedAnswer: boolean;
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
  startedAt: string | null; completedAt: string | null; createdAt: string;
  checklist: { id: string; name: string; type: string };
  user: { id: string; name: string };
  asset: { id: string; name: string } | null;
  _count: { items: number };
}

export interface ExecutionDetail {
  id: string; status: string; score: number | null; notes: string | null;
  signatureUrl: string | null;
  startedAt: string | null; completedAt: string | null; createdAt: string;
  checklist: { id: string; name: string; type: string; items: { id: string; order: number; question: string; description: string | null; requiresPhoto: boolean; requiresNote: boolean; expectedAnswer: boolean }[] };
  user: { id: string; name: string; email: string };
  asset: { id: string; name: string; qrCode: string } | null;
  items: {
    id: string; answer: boolean | null; notes: string | null; photoUrl: string | null;
    checklistItem: { id: string; order: number; question: string; requiresPhoto: boolean; requiresNote: boolean };
  }[];
}

export interface WorkOrder {
  id: string; code: string; title: string; description: string;
  status: string; priority: string; dueDate: string | null;
  startedAt: string | null; completedAt: string | null; updatedAt: string; createdAt: string; notes: string | null;
  cost: number | null; materialsUsed: string | null; photoUrls: string[];
  unit: { id: string; name: string };
  asset: { id: string; name: string; qrCode: string } | null;
  creator: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  supplier: { id: string; name: string; category: string | null; phone: string | null } | null;
}

export interface KPITrend { pct: number; prev: number; }

export type DashboardPeriodFilter = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface DashboardPeriodParams {
  period?: DashboardPeriodFilter;
  startDate?: string;
  endDate?: string;
  unitId?: string;
}

export interface DashboardPeriod {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
}

export interface DashboardKPIs {
  period: DashboardPeriod;
  summary: {
    totalAssets: number; activeAssets: number; assetsInMaintenance: number;
    totalWorkOrders: number; openWorkOrders: number; inProgressWorkOrders: number;
    overdueWorkOrders: number; completedThisMonth: number;
    checklistsThisMonth: number; checklistCompletionRate: number;
    openIncidents: number; criticalIncidents: number;
    activeChecklists: number;
    maintenanceCostThisMonth: number;
    trends?: {
      newWorkOrders: KPITrend;
      completedThisMonth: KPITrend;
      checklistsThisMonth: KPITrend;
      checklistCompletionRate: KPITrend;
      newIncidents: KPITrend;
      maintenanceCost: KPITrend;
    };
  };
  charts: {
    assetsByStatus: { status: string; count: number }[];
    woByPriority: { priority: string; count: number }[];
    woByStatus: { status: string; count: number }[];
    checklistsByType: { type: string; count: number }[];
    incidentsByUnit: { unit: string; count: number }[];
  };
  recentActivity: { executions: Execution[]; workOrders: WorkOrder[]; completedWorkOrders: WorkOrder[] };
  alerts: { assetsNeedingMaintenance: (Asset & { isOverdue: boolean })[] };
}

export interface UnitRankingItem {
  id: string;
  name: string;
  code: string | null;
  score: number;
  eligible: boolean;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  indicators: {
    activeAssets: number;
    checklistExecutions: number;
    conformityRate: number | null;
    workOrdersCreated: number;
    openWorkOrders: number;
    overdueWorkOrders: number;
    slaOrders: number;
    slaRate: number | null;
    incidents: number;
    weightedIncidents: number;
    maintenanceDue: number;
    overdueMaintenance: number;
  };
}

export interface UnitRankingResult {
  period: DashboardPeriod;
  formula: {
    weights: {
      conformity: number;
      sla: number;
      workOrderHealth: number;
      incidents: number;
      preventive: number;
    };
    incidentNormalization: string;
    eligibility: string;
  };
  totals: {
    comparedUnits: number;
    eligibleUnits: number;
    insufficientDataUnits: number;
  };
  best: UnitRankingItem[];
  worst: UnitRankingItem[];
}

export interface MyActionsResult {
  dueSchedules: {
    id: string; nextDueAt: string;
    checklist: { id: string; name: string; type: string };
    asset: { id: string; name: string } | null;
  }[];
  urgentWorkOrders: {
    id: string; code: string; title: string;
    status: string; priority: string; dueDate: string | null;
    unit: { id: string; name: string };
    asset: { id: string; name: string } | null;
  }[];
  total: number;
  period?: DashboardPeriod;
}

export type AlertSeverity = 'CRITICO' | 'ALTO' | 'MEDIO' | 'INFORMATIVO';

export interface OperationalAlert {
  fingerprint: string;
  source:
    | 'WORK_ORDER_OVERDUE'
    | 'MAINTENANCE_OVERDUE'
    | 'CHECKLIST_OVERDUE'
    | 'ASSET_WITHOUT_INSPECTION'
    | 'INCIDENT_OPEN';
  severity: AlertSeverity;
  title: string;
  body: string;
  href: string;
  unit: { id: string; name: string } | null;
  occurredAt: string;
  isRead: boolean;
  readAt: string | null;
}

export interface AlertsResult extends Paginated<OperationalAlert> {
  summary: {
    total: number;
    unread: number;
    bySeverity: Record<AlertSeverity, number>;
  };
}

export interface User {
  id: string; name: string; email: string; role: string;
  phone: string | null; isActive: boolean; lastLoginAt: string | null;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export interface SubscriptionStatus {
  subscriptionStatus: string;
  plan: string;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export interface RecoverResult {
  companyId: string;
  companyName: string;
  subscriptionStatus: string;
  plan: string;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  billingPortalUrl: string | null;
  message: string;
}

export const authApi = {
  findCompanies: (email: string) =>
    api.get<{ id: string; name: string; logoUrl: string | null; isActive: boolean }[]>(
      `/auth/find-companies`, { params: { email } }
    ),
  login: (email: string, password: string, companyId: string) =>
    api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', { email, password, companyId }),
  me: () => api.get<AuthUser>('/auth/me'),
  registerTenant: (data: {
    companyName: string; companyEmail: string;
    ownerName: string; ownerEmail: string;
    password: string; phone?: string; cnpj?: string;
  }) =>
    api.post<{ accessToken: string; refreshToken: string; trialEndsAt: string; user: AuthUser }>(
      '/auth/register-tenant', data
    ),
};

export const subscriptionsApi = {
  status: () => api.get<SubscriptionStatus>('/subscriptions/status'),
  checkout: (plan: string) => api.post<{ url: string }>('/subscriptions/checkout', { plan }),
  billingPortal: () => api.get<{ url: string }>('/subscriptions/billing-portal'),
  recover: (email: string, companyId: string, password: string) =>
    rawApi.post<RecoverResult>('/subscriptions/recover', { email, companyId, password }),
};

export const dashboardApi = {
  kpis: (params?: DashboardPeriodParams) => api.get<DashboardKPIs>('/dashboard/kpis', { params }),
  unitRanking: (params?: DashboardPeriodParams) =>
    api.get<UnitRankingResult>('/dashboard/unit-ranking', { params }),
  myActions: (params?: DashboardPeriodParams) => api.get<MyActionsResult>('/dashboard/my-actions', { params }),
};

export const alertsApi = {
  list: (params?: Record<string, unknown>) => api.get<AlertsResult>('/alerts', { params }),
  markRead: (fingerprint: string) =>
    api.patch<{ fingerprint: string; readAt: string; isRead: true }>(
      `/alerts/${encodeURIComponent(fingerprint)}/read`,
    ),
};

export const assetsApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<Asset>>('/assets', { params }),
  get: (id: string) => api.get<Asset>(`/assets/${id}`),
  create: (data: Record<string, unknown>) => api.post<Asset>('/assets', data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Asset>(`/assets/${id}`, data),
  qrData: (id: string) => api.get<{ qrCode: string; qrData: string; dataUrl: string }>(`/assets/${id}/qr-data`),
  qrImageUrl: (id: string) => `${API_URL}/assets/${id}/qr-image`,
  remove: (id: string) => api.delete(`/assets/${id}`),
  recurringIssues: (months?: number) =>
    api.get<RecurringIssueAsset[]>('/assets/recurring-issues', { params: months ? { months } : undefined }),
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
  getExecution: (id: string) => api.get<ExecutionDetail>(`/executions/${id}`),
  deleteExecution: (id: string) => api.delete(`/executions/${id}`),
};

export const workOrdersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<WorkOrder>>('/work-orders', { params }),
  get: (id: string) => api.get<WorkOrder>(`/work-orders/${id}`),
  my: () => api.get<WorkOrder[]>('/work-orders/my'),
  create: (data: Record<string, unknown>) => api.post<WorkOrder>('/work-orders', data),
  updateStatus: (id: string, status: string, notes?: string, extra?: { cost?: number; materialsUsed?: string; photoUrls?: string[]; supplierId?: string }) =>
    api.patch<WorkOrder>(`/work-orders/${id}/status`, { status, notes, ...extra }),
  assign: (id: string, assigneeId: string) =>
    api.patch<WorkOrder>(`/work-orders/${id}/assign/${assigneeId}`),
  delete: (id: string) => api.delete(`/work-orders/${id}`),
};

export const usersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<User>>('/users', { params }),
};

export interface ChecklistSchedule {
  id: string;
  name: string | null;
  nextDueAt: string;
  repeatDays: number | null;
  reminderDaysBefore: number | null;
  isActive: boolean;
  checklist: { id: string; name: string; type: string };
  asset: { id: string; name: string } | null;
  assignee: { id: string; name: string; email: string } | null;
}

export const schedulesApi = {
  byChecklist: (checklistId: string) =>
    api.get<ChecklistSchedule | null>(`/checklist-schedules/by-checklist/${checklistId}`),
  create: (data: Record<string, unknown>) =>
    api.post<ChecklistSchedule>('/checklist-schedules', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<ChecklistSchedule>(`/checklist-schedules/${id}`, data),
  remove: (id: string) => api.delete(`/checklist-schedules/${id}`),
};

export const companiesApi = {
  me: () => api.get<Company>('/companies/me'),
};

export const reportsApi = {
  monthly: (unitId: string, month: number, year: number) =>
    api.get('/reports/monthly', { params: { unitId, month, year }, responseType: 'blob' }),
};
