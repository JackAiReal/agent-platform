import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Get(':slotId/host-dashboard')
  getHostDashboard(@Param('slotId') slotId: string) {
    return this.slotsService.getHostDashboard(slotId);
  }

  @Get(':slotId')
  getSlot(@Param('slotId') slotId: string) {
    return this.slotsService.getSlot(slotId);
  }

  @Post(':slotId/close-speed-stage')
  closeSpeedStage(@Param('slotId') slotId: string) {
    return this.slotsService.closeSpeedStage(slotId);
  }

  @Post(':slotId/close-final-stage')
  closeFinalStage(@Param('slotId') slotId: string) {
    return this.slotsService.closeFinalStage(slotId);
  }

  @Post(':slotId/toggle-add-stage')
  toggleAddStage(@Param('slotId') slotId: string, @Body() body: { enabled: boolean }) {
    return this.slotsService.toggleAddStage(slotId, body.enabled);
  }
}
