import { Body, Controller, Post } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateFromRoomDto } from './dto/create-from-room.dto';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post('from-room')
  createFromRoom(@Body() dto: CreateFromRoomDto) {
    return this.teamService.createFromRoom(dto);
  }
}
