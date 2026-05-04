import type {
  ApiErrorResponse,
  ApiSuccess,
  AuthSession,
  LoginPayload,
} from '@/types/auth';
import type {
  CreateTenantPayload,
  CreateTenantResult,
  TenantDetail,
  Tenant,
  TenantActionPayload,
  TenantActionResult,
  TenantListQuery,
  TenantListResponse,
} from '@/types/tenant';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:3001/v1';

const AUTH_TOKEN_KEY = 'weteams_auth_token';

export class ApiError extends Error {
  status: number;
  details: ApiErrorResponse | null;

  constructor(message: string, status = 500, details: ApiErrorResponse | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getStoredToken() {
  if (!isBrowser()) {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

function buildUrl(pathname: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(pathname.replace(/^\//, ''), `${API_BASE_URL}/`);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url;
}

async function parseResponse<T>(response: Response): Promise<ApiSuccess<T>> {
  const contentType = response.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const errorPayload: ApiErrorResponse =
      parsed && typeof parsed === 'object'
        ? (parsed as ApiErrorResponse)
        : {
            success: false as const,
            message:
              typeof parsed === 'string' && parsed
                ? parsed
                : 'Request failed',
          };

    const message = Array.isArray(errorPayload.message)
      ? errorPayload.message.join(', ')
      : errorPayload.message;

    throw new ApiError(message, response.status, errorPayload);
  }

  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
    return parsed as ApiSuccess<T>;
  }

  return {
    success: true,
    message: 'Success',
    data: parsed as T,
  };
}

export async function request<T>(
  pathname: string,
  options: RequestInit & { searchParams?: Record<string, string | number | boolean | undefined> } = {},
) {
  const { searchParams, headers, ...rest } = options;
  const token = getStoredToken();
  const url = buildUrl(pathname, searchParams);

  const response = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  return parseResponse<T>(response);
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const isEmail = payload.identifier.includes('@');
  const response = await request<{ access_token: string; user: { id: string; email: string; username: string; role: string; tenantId?: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      ...(isEmail ? { email: payload.identifier } : { username: payload.identifier }),
      password: payload.password,
    }),
  });

  if (response.data?.access_token) {
    return {
      token: response.data.access_token,
      user: response.data.user,
      source: 'api',
    };
  }

  throw new ApiError('Login failed', 401);
}

export async function getTenants(query: TenantListQuery = {}) {
  const response = await request<TenantListResponse>('/tenants', {
    method: 'GET',
    searchParams: query as Record<string, string | number | boolean | undefined>,
  });

  return response.data;
}

export async function getTenantById(tenantId: string): Promise<TenantDetail> {
  const response = await request<TenantDetail>(`/tenants/${tenantId}/detail`, {
    method: 'GET',
  });

  return response.data;
}

export async function createTenant(payload: CreateTenantPayload): Promise<CreateTenantResult> {
  const response = await request<CreateTenantResult>('/tenants', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
}

export async function deleteTenant(payload: TenantActionPayload): Promise<TenantActionResult> {
  const response = await request<TenantActionResult>('/tenants', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });

  return response.data;
}

export async function updateTenantConfig(payload: TenantActionPayload) {
  const response = await request<TenantActionResult>(`/tenants/${payload.tenantId}/config`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
}

export async function restartTenantService(payload: TenantActionPayload) {
  const response = await request<TenantActionResult>(`/tenants/${payload.tenantId}/restart`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
}

export async function fetchTenantLogs(payload: TenantActionPayload) {
  const response = await request<TenantActionResult>(`/tenants/${payload.tenantId}/logs`, {
    method: 'GET',
  });

  return response.data;
}
