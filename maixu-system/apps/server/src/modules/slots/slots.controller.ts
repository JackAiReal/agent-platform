import { Controller, Get, Param } from '@nestjs/common';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get('health')
  health() {
    return this.slotsService.getHealth();
  }

  @Get(':slotId/rank')
  getSlotRank(@Param('slotId') slotId: string) {
    return this.slotsService.getSlotRank(slotId);
  }

  @Get(':slotId')
  getSlot(@Param('slotId') slotId: string) {
    return this.slotsService.getSlot(slotId);
  }
}
