import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateFromRoomDto } from './dto/create-from-room.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';

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

  @HttpCode(200)
  @Post('leave')
  leaveTeam(@Body() dto: LeaveTeamDto) {
    return this.teamService.handleUserLeave(dto);
  }

  @HttpCode(200)
  @Delete('/')
  deleteTeam(@Body() dto: DeleteTeamDto) {
    return this.teamService.handleDeleteTeam(dto);
  }
}
