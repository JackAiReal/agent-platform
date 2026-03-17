import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('health')
  health() {
    return this.notificationsService.getHealth();
  }

  @UseGuards(JwtAuthGuard)
  @Post('leave-notices/check-timeouts')
  checkLeaveNoticeTimeouts(@Body() body?: { slotId?: string; dryRun?: boolean; simulateNowOffsetSeconds?: number }) {
    return this.notificationsService.checkLeaveNoticeTimeouts(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('logs')
  listLogs(@Query('status') status?: NotificationStatus, @Query('limit') limit?: string) {
    return this.notificationsService.listLogs({ status, limit: Number(limit) || 50 });
  }
}
