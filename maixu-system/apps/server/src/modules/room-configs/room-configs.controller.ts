import { Controller, Get } from '@nestjs/common';
import { RoomConfigsService } from './room-configs.service';

@Controller('room-configs')
export class RoomConfigsController {
  constructor(private readonly roomconfigsService: RoomConfigsService) {}

  @Get('health')
  health() {
    return this.roomconfigsService.getHealth();
  }
}
