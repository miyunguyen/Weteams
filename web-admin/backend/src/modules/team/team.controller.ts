import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateFromRoomDto } from './dto/create-from-room.dto';
import { JoinTeamDto } from './dto/join-team.dto';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @HttpCode(201)
  @Post('from-room')
  createFromRoom(@Body() dto: CreateFromRoomDto) {
    return this.teamService.createFromRoom(dto);
  }

  @HttpCode(200)
  @Post('join')
  join(@Body() dto: JoinTeamDto) {
    return this.teamService.joinByCode(dto);
  }
}
