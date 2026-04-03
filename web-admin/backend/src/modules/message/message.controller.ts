import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { MessageService } from './message.service';
import { PinMessageDto } from './dto/pin-message.dto';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @HttpCode(200)
  @Post(':messageId/pin')
  pinMessage(
    @Param('messageId') messageId: string,
    @Body() dto: PinMessageDto,
  ) {
    return this.messageService.pinMessage(dto.tenantId, messageId);
  }
}
