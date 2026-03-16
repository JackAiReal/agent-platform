import { Module } from '@nestjs/common';
import { LeaveNoticesController } from './leave-notices.controller';
import { LeaveNoticesService } from './leave-notices.service';

@Module({
  controllers: [LeaveNoticesController],
  providers: [LeaveNoticesService],
  exports: [LeaveNoticesService],
})
export class LeaveNoticesModule {}
