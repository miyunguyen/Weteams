/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class MessageService {
  constructor(private readonly rocketChatService: RocketChatService) {}

  async pinMessage(tenantId: string, messageId: string) {
    const response = await this.rocketChatService.pinMessage(
      tenantId,
      messageId,
    );
    const responseData = response?.data;

    if (!responseData?.success) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Pin message thất bại',
        errorCode: 'PIN_MESSAGE_FAILED',
        data: responseData ?? null,
      });
    }

    return {
      message: 'Pin message thành công',
      data: {
        messageId,
      },
    };
  }
}
