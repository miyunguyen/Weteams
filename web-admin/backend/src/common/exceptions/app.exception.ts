import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppExceptionBody {
  message: string;
  errorCode: string;
  data?: unknown;
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, body: AppExceptionBody) {
    super(
      {
        message: body.message,
        errorCode: body.errorCode,
        data: body.data ?? null,
      },
      status,
    );
  }
}
