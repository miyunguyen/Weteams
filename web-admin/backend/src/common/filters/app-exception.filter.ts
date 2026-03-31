import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let errorCode = this.getDefaultErrorCode(status);
    let data: unknown = null;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        if (responseObj.message !== undefined) {
          message = responseObj.message as string | string[];
        }
        if (typeof responseObj.errorCode === 'string') {
          errorCode = responseObj.errorCode;
        }
        if (responseObj.data !== undefined) {
          data = responseObj.data;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      message,
      errorCode,
      data,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private getDefaultErrorCode(status: number): string {
    const statusName = HttpStatus[status];
    return typeof statusName === 'string'
      ? statusName
      : 'INTERNAL_SERVER_ERROR';
  }
}
