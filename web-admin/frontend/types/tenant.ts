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

export interface SendTenantTeamsMessagePayload {
  tenantId: string;
  teamIds: string[];
  text: string;
}

export interface SendTenantTeamsMessageResult {
  message: string;
  data: {
    sentCount: number;
    teamIds: string[];
    failedTeams?: Array<{
      teamId: string;
      roomId: string;
      message: string;
    }>;
  };
}

export interface TenantDeployAppPayload {
  tenantId: string;
  maxAttempts?: number;
  delayMs?: number;
}

export interface TenantDeployAppResult {
  message: string;
  data: {
    tenantId?: string;
    composeProjectName?: string;
    rocketUrl?: string;
    appEngineDir?: string;
    commandUsed?: string;
    stdout?: string;
    stderr?: string;
    reason?: string;
    deployStatus?: string;
    tenant?: Tenant;
  };
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

export interface TenantDetailAdmin {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetail extends Tenant {
  _count: {
    users: number;
    teams: number;
  };
  teamMemberTotal: number;
  teams: TenantDetailTeam[];
  users: TenantDetailUser[];
  tenantAdmins: TenantDetailAdmin[];
}

export interface CreateTenantPayload {
  name: string;
  domain: string;
  composeProjectName?: string;
  rootUrl?: string;
  release?: string;
  regToken?: string;
  port?: number;
  bindIp?: string;
  adminUsername?: string;
  adminPass?: string;
  mongodbBindIp?: string;
  mongodbPortNumber?: number;
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
