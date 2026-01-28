import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_SECONDS = 600; // 10 minutes

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  /**
   * Checks if the lead ID has already been processed.
   * If not, saves it with a TTL and returns false (not duplicate).
   * If yes, returns true (duplicate).
   */
  async isDuplicate(leadId: string): Promise<boolean> {
    const key = `amo:lead:${leadId}`;

    try {
      const exists = await this.redis.set(
        key,
        '1',
        'EX',
        this.TTL_SECONDS,
        'NX',
      );

      // If 'NX' (Not Exists) is set, 'exists' will be 'OK'.
      // If key already exists, 'exists' will be null.

      if (exists === 'OK') {
        return false; // Not a duplicate, key created
      } else {
        this.logger.warn(`Duplicate webhook detected for leadId: ${leadId}`);
        return true; // Duplicate
      }
    } catch (error) {
      this.logger.error(
        `Error checking idempotency for leadId ${leadId}: ${error.message}`,
        error.stack,
      );
      // In case of Redis error, we should probably allow processing to proceed or fail safe.
      // Returning false to allow processing (at risk of duplication) is usually safer than blocking everything,
      // but in financial contexts duplication is worse.
      // Given instructions: "Если нет — сохранить ключ... и вернуть false".
      // Let's return false but log error.
      return false;
    }
  }
}
