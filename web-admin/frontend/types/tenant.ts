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
  hostPort: number;
  port: number;
  metricsPort: number;
  bindIp: string;
  mongodbBindIp: string;
  mongodbPortNumber: number;
  mongodbHostPortNumber?: number | null;
  natsPortNumber: number;
  natsBindIp: string;
  release: string;
  regToken?: string | null;
  adminUsername: string;
  adminPass: string;
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

export interface TenantDetailTeamMemberUser {
  id: string;
  tenantId: string;
  rocketUserId: string;
  username: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  citizenId?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetailTeamMember {
  id: string;
  joinedAt: string;
  user: TenantDetailTeamMemberUser;
}

export interface TenantDetailTeam {
  id: string;
  tenantId: string;
  roomId: string;
  name?: string | null;
  joinCode: string;
  teamId: string;
  createdAt: string;
  members: TenantDetailTeamMember[];
}

export interface TenantDetailUserTeam {
  id: string;
  tenantId: string;
  roomId: string;
  name?: string | null;
  joinCode: string;
  teamId: string;
  createdAt: string;
}

export interface TenantDetailUserTeamMember {
  id: string;
  joinedAt: string;
  team: TenantDetailUserTeam;
}

export interface TenantDetailUser {
  id: string;
  tenantId: string;
  rocketUserId: string;
  username: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  citizenId?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  teamMembers: TenantDetailUserTeamMember[];
}

export interface TenantDetail extends Tenant {
  _count: {
    users: number;
    teams: number;
  };
  teamMemberTotal: number;
  teams: TenantDetailTeam[];
  users: TenantDetailUser[];
}

export interface CreateTenantPayload {
  name: string;
  domain: string;
  composeProjectName?: string;
  rootUrl?: string;
  release?: string;
  regToken?: string;
  hostPort?: number;
  port?: number;
  metricsPort?: number;
  bindIp?: string;
  adminUsername?: string;
  adminPass?: string;
  mongodbBindIp?: string;
  mongodbPortNumber?: number;
  mongodbHostPortNumber?: number;
  natsPortNumber?: number;
  natsBindIp?: string;
}

export interface CreateTenantResult {
  message: string;
  data: {
    tenant?: Tenant;
    tenantId?: string;
    composeProjectName?: string;
    rocketUrl?: string;
    deployStatus?: DeployStatus;
    reason?: string;
  };
}
