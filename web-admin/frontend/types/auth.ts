export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface AuthUser {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  user?: AuthUser;
  source: 'api' | 'mock';
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string | string[];
  errorCode?: string;
  data?: unknown;
  statusCode?: number;
  timestamp?: string;
  path?: string;
}
