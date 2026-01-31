import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { YookassaService } from './yookassa.service';

type SyncJobPayload = {
  paymentId: string;
  trigger?: 'create' | 'webhook' | 'manual' | 'retry';
  attempt?: number;
};

@Injectable()
@Processor('yookassa', { concurrency: 5 })
export class YookassaProcessor extends WorkerHost {
  private readonly logger = new Logger(YookassaProcessor.name);

  constructor(private readonly yookassaService: YookassaService) {
    super();
  }

  async process(job: Job<SyncJobPayload>): Promise<void> {
    const { paymentId, trigger = 'manual', attempt = 0 } = job.data || {};

    if (!paymentId) {
      this.logger.warn(
        `Received YooKassa sync job ${job.id} without paymentId`,
      );
      return;
    }

    this.logger.log(
      `Processing YooKassa sync job ${job.id} for payment ${paymentId} (trigger=${trigger}, attempt=${attempt})`,
    );

    try {
      await this.yookassaService.syncPayment(paymentId, trigger, attempt);
    } catch (error: any) {
      this.logger.error(
        `Sync failed for payment ${paymentId}: ${error?.message || error}`,
        error?.stack,
      );
      throw error;
    }
  }
}
