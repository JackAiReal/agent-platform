import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { HostSchedulesService } from './host-schedules.service';

@Controller('host-schedules')
export class HostSchedulesController {
  constructor(private readonly hostSchedulesService: HostSchedulesService) {}

  @Get('health')
  health() {
    return this.hostSchedulesService.getHealth();
  }

  @Get('rooms/:roomId/resolve')
  resolveHost(
    @Param('roomId') roomId: string,
    @Query('slotDate') slotDate?: string,
    @Query('slotHour') slotHour?: string,
  ) {
    return this.hostSchedulesService.resolveHost(roomId, {
      slotDate,
      slotHour: slotHour === undefined ? undefined : Number(slotHour),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId')
  listSchedules(@Param('roomId') roomId: string) {
    return this.hostSchedulesService.listSchedules(roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/overrides')
  listOverrides(@Param('roomId') roomId: string) {
    return this.hostSchedulesService.listOverrides(roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms/:roomId')
  createSchedule(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { weekday: number; startHour: number; endHour: number; hostUserId: string; priority?: number; isActive?: boolean },
  ) {
    return this.hostSchedulesService.createSchedule(roomId, user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':scheduleId')
  deleteSchedule(@Param('scheduleId') scheduleId: string, @CurrentUser() user: { sub: string }) {
    return this.hostSchedulesService.deleteSchedule(scheduleId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms/:roomId/overrides')
  createOverride(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { slotDate: string; slotHour: number; hostUserId: string; oneTimeOnly?: boolean; remark?: string },
  ) {
    return this.hostSchedulesService.createOverride(roomId, user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('overrides/:overrideId')
  deleteOverride(@Param('overrideId') overrideId: string, @CurrentUser() user: { sub: string }) {
    return this.hostSchedulesService.deleteOverride(overrideId, user.sub);
  }
}
