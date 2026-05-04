import { io, type Socket } from 'socket.io-client';

const SOCKET_BASE_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, '') ??
  'http://localhost:3001';

let socket: Socket | null = null;

export type TenantRealtimeEvent = {
  tenantId: string;
  action: string;
  deployStatus?: string;
  updatedAt?: string;
};

export function getTenantSocket() {
  if (!socket) {
    socket = io(`${SOCKET_BASE_URL}/tenants`, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socket;
}
