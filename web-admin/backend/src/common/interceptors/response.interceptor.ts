import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse> {
    return next.handle().pipe(map((payload) => this.formatSuccess(payload)));
  }

  private formatSuccess(payload: unknown): SuccessResponse {
    if (this.isSuccessResponse(payload)) {
      return payload;
    }

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      'data' in payload
    ) {
      const payloadObj = payload as { message: unknown; data: unknown };
      return {
        success: true,
        message:
          typeof payloadObj.message === 'string'
            ? payloadObj.message
            : 'Success',
        data: payloadObj.data,
      };
    }

    return {
      success: true,
      message: 'Success',
      data: payload ?? null,
    };
  }

  private isSuccessResponse(payload: unknown): payload is SuccessResponse {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      'message' in payload &&
      'data' in payload
    );
  }
}
