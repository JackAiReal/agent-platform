import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RoomConfigsService } from './room-configs.service';

@Controller('room-configs')
export class RoomConfigsController {
  constructor(private readonly roomConfigsService: RoomConfigsService) {}

  @Get('health')
  health() {
    return this.roomConfigsService.getHealth();
  }

  @Get('rooms/:roomId')
  getConfigs(@Param('roomId') roomId: string) {
    return this.roomConfigsService.getConfigs(roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('rooms/:roomId')
  updateConfigs(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { configs: Record<string, unknown> },
  ) {
    return this.roomConfigsService.updateConfigs(roomId, user.sub, body);
  }
}
