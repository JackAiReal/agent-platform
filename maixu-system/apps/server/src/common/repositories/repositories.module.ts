import { Global, Module } from '@nestjs/common';
import { RankRepository } from '../../modules/rank/repositories/rank.repository';
import { RoomsRepository } from '../../modules/rooms/repositories/rooms.repository';
import { SlotsRepository } from '../../modules/slots/repositories/slots.repository';

@Global()
@Module({
  providers: [RoomsRepository, SlotsRepository, RankRepository],
  exports: [RoomsRepository, SlotsRepository, RankRepository],
})
export class RepositoriesModule {}
