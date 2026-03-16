import { Controller, Get } from '@nestjs/common';
import { HostSchedulesService } from './host-schedules.service';

@Controller('host-schedules')
export class HostSchedulesController {
  constructor(private readonly hostschedulesService: HostSchedulesService) {}

  @Get('health')
  health() {
    return this.hostschedulesService.getHealth();
  }
}
