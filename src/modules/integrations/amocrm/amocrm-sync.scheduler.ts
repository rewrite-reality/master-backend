import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class AmoCrmSyncScheduler {
  private readonly logger = new Logger(AmoCrmSyncScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('amocrm-sync')
    private readonly queue: Queue,
  ) {}

  @Cron('*/60 * * * * *')
  async requeuePending() {
    const due = await this.prisma.integrationOutbox.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        nextRetryAt: { lte: new Date() },
      },
      take: 200,
    });

    for (const outbox of due) {
      try {
        await this.queue.add(
          'sync',
          { outboxId: outbox.id },
          {
            jobId: outbox.id, // ✅ UUID без запрещённых символов
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        );
      } catch (error: any) {
        this.logger.warn(
          `Failed to requeue outbox ${outbox.id}: ${error?.message || error}`,
        );
      }
    }
  }
}
