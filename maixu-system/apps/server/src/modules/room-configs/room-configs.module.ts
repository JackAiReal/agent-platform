import { Module } from '@nestjs/common';
import { RoomConfigsController } from './room-configs.controller';
import { RoomConfigsService } from './room-configs.service';

@Module({
  controllers: [RoomConfigsController],
  providers: [RoomConfigsService],
  exports: [RoomConfigsService],
})
export class RoomConfigsModule {}
