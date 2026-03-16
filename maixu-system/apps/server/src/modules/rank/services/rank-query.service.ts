import { Injectable } from '@nestjs/common';
import { RankRepository } from '../repositories/rank.repository';

@Injectable()
export class RankQueryService {
  constructor(private readonly rankRepository: RankRepository) {}

  async getSlotRank(slotId: string) {
    return this.rankRepository.getRank(slotId);
  }
}
