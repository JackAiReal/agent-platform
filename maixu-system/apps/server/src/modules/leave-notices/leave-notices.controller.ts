import { Controller, Get } from '@nestjs/common';
import { LeaveNoticesService } from './leave-notices.service';

@Controller('leave-notices')
export class LeaveNoticesController {
  constructor(private readonly leavenoticesService: LeaveNoticesService) {}

  @Get('health')
  health() {
    return this.leavenoticesService.getHealth();
  }
}
