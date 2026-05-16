import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { MessageService } from './message.service';
import { PinMessageDto } from './dto/pin-message.dto';

@Controller('messages')
export class MessageController {
  private readonly messageService: MessageService;

  constructor(messageService: MessageService) {
    this.messageService = messageService;
  }

  @HttpCode(200)
  @Post(':messageId/pin')
  pinMessage(
    @Param('messageId') messageId: string,
    @Body() dto: PinMessageDto,
  ) {
    return this.messageService.pinMessage(dto.tenantId, messageId);
  }

  @HttpCode(200)
  @Post('send')
  async sendTeamsMessage(
    @Body() dto: { tenantId: string; teamIds: string[]; text: string },
  ): Promise<unknown> {
    const messageService = this.messageService as {
      sendTeamsMessage: (
        tenantId: string,
        teamIds: string[],
        text: string,
      ) => Promise<unknown>;
    };

    return await messageService.sendTeamsMessage(
      dto.tenantId,
      dto.teamIds,
      dto.text,
    );
  }
}
