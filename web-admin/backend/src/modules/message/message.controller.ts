import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { MessageService } from './message.service';
import { PinMessageDto } from './dto/pin-message.dto';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @HttpCode(200)
  @Post('pin')
  pinMessage(@Body() dto: PinMessageDto) {
    return this.messageService.pinMessage(dto);
  }
}
