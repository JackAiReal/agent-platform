import { ConflictException, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly redisService: RedisService) {}

  async execute<T>(
    scope: string,
    idempotencyKey: string | undefined,
    handler: () => Promise<T>,
    ttlSeconds = 120,
  ): Promise<T> {
    const key = idempotencyKey?.trim();
    if (!key) {
      return handler();
    }

    const dataKey = `idem:${scope}:${key}`;
    const lockKey = `${dataKey}:lock`;
    const redis = this.redisService.getClient();

    const cached = await redis.get(dataKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    const lock = await redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!lock) {
      throw new ConflictException('duplicate request is in progress, please retry later');
    }

    try {
      const result = await handler();
      await redis.set(dataKey, JSON.stringify(result), 'EX', ttlSeconds);
      return result;
    } finally {
      await redis.del(lockKey);
    }
  }
}
