import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

export type TenantRealtimePayload = {
  tenantId: string;
  action: string;
  deployStatus?: string;
  updatedAt?: string;
};

@WebSocketGateway({
  namespace: '/tenants',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://admin.weteams.net',
    ],
    credentials: true,
  },
})
export class TenantGateway {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(TenantGateway.name);

  emitTenantUpdated(payload: TenantRealtimePayload): void {
    this.logger.debug(`tenant.updated ${payload.tenantId} ${payload.action}`);
    this.server?.emit('tenant.updated', payload);
  }
}
