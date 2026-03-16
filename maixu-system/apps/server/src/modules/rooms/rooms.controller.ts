import { Controller, Get, Param } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('health')
  health() {
    return this.roomsService.getHealth();
  }

  @Get()
  listRooms() {
    return this.roomsService.listRooms();
  }

  @Get(':roomId/current-slot')
  getCurrentSlot(@Param('roomId') roomId: string) {
    return this.roomsService.getCurrentSlot(roomId);
  }

  @Get(':roomId')
  getRoom(@Param('roomId') roomId: string) {
    return this.roomsService.getRoom(roomId);
  }
}
