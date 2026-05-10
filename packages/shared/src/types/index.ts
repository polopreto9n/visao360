// ─── Roles e Enums ────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'GESTOR' | 'TECNICO' | 'CLIENTE';

export type AssetStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';

export type ChecklistType = 'PREVENTIVE' | 'CORRECTIVE' | 'INSPECTION' | 'AUDIT';

export type ExecutionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type WorkOrderStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'CANCELLED';

export type WorkOrderPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export type NotificationType =
  | 'CHECKLIST_DUE'
  | 'WORK_ORDER_ASSIGNED'
  | 'INCIDENT_OPENED'
  | 'ASSET_ALERT'
  | 'SYSTEM';

// ─── Respostas genéricas da API ───────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  details?: unknown;
  timestamp: string;
  path: string;
}

// ─── DTOs de autenticação ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ─── Entidades base ───────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDTO extends BaseEntity {
  name: string;
  cnpj: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  isActive: boolean;
}

export interface UserDTO extends BaseEntity {
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface UnitDTO extends BaseEntity {
  companyId: string;
  name: string;
  code: string | null;
  address: string | null;
  description: string | null;
  isActive: boolean;
}

export interface AssetDTO extends BaseEntity {
  companyId: string;
  unitId: string;
  name: string;
  code: string | null;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  qrCode: string;
  status: AssetStatus;
  installDate: string | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  description: string | null;
  photoUrl: string | null;
}

export interface WorkOrderDTO extends BaseEntity {
  companyId: string;
  unitId: string;
  assetId: string | null;
  creatorId: string;
  assigneeId: string | null;
  code: string;
  title: string;
  description: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
}

// ─── KPIs do Dashboard ────────────────────────────────────────────────────────

export interface DashboardKPIs {
  totalAssets: number;
  activeAssets: number;
  assetsInMaintenance: number;
  openWorkOrders: number;
  overdueWorkOrders: number;
  checklistsThisMonth: number;
  checklistCompletionRate: number;
  openIncidents: number;
  criticalIncidents: number;
}
