import { Module } from '@nestjs/common';
import { HostSchedulesController } from './host-schedules.controller';
import { HostSchedulesService } from './host-schedules.service';

@Module({
  controllers: [HostSchedulesController],
  providers: [HostSchedulesService],
  exports: [HostSchedulesService],
})
export class HostSchedulesModule {}
