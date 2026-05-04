export type DeployStatus = 'PENDING' | 'DEPLOYING' | 'RUNNING' | 'FAILED';

export interface Tenant {
  id: string;
  name: string;
  composeProjectName: string;
  domain: string;
  rootUrl: string;
  rocketUrl: string;
  deployStatus: DeployStatus;
  deployError?: string | null;
  createdAt: string;
  updatedAt: string;
  lastProvisionedAt?: string | null;
}

export interface TenantListQuery {
  search?: string;
  deployStatus?: string;
  isDeleted?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'deployStatus';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TenantListResponse {
  items: Tenant[];
  pagination: Pagination;
}

export interface TenantActionPayload {
  tenantId: string;
}

export interface TenantActionResult {
  message: string;
  data: unknown;
}
