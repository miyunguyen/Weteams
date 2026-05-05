import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateFromRoomDto } from './dto/create-from-room.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';
import { CreateTeamWithChannelsDto } from './dto/create-team-with-channels.dto';

@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @HttpCode(201)
  @Post('room-syncs')
  createFromRoom(@Body() dto: CreateFromRoomDto) {
    return this.teamService.createFromRoom(dto);
  }

  @HttpCode(201)
  @Post()
  createTeam(@Body() dto: CreateTeamWithChannelsDto) {
    return this.teamService.createTeamWithChannels(dto);
  }

  @HttpCode(200)
  @Post('memberships')
  join(@Body() dto: JoinTeamDto) {
    return this.teamService.joinByCode(dto);
  }

  @HttpCode(200)
  @Delete('memberships')
  leaveTeam(@Body() dto: LeaveTeamDto) {
    return this.teamService.handleUserLeave(dto);
  }

  @HttpCode(200)
  @Delete()
  deleteTeam(@Body() dto: DeleteTeamDto) {
    return this.teamService.handleDeleteTeam(dto);
  }

  @HttpCode(200)
  @Get(':teamId/members')
  getTeamMembers(
    @Param('teamId') teamId: string,
    @Query() query: Record<string, any> = {},
  ) {
    const page = Number(query?.page) || 1;
    const pageSize = Number(query?.pageSize) || 20;
    return this.teamService.listTeamMembers(teamId, page, pageSize);
  }

  @HttpCode(200)
  @Post('sync-members')
  syncMembersForUser(@Body() body: { tenantId: string; rocketUserId: string }) {
    return this.teamService.syncTeamMembershipsForUser(
      body.tenantId,
      body.rocketUserId,
    );
  }

  @HttpCode(200)
  @Post('sync-all-members')
  syncAllMemberships(@Body() body: { tenantId: string }) {
    return this.teamService.syncAllTeamMembershipsForTenant(body.tenantId);
  }
}
