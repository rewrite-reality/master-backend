import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TelegramService } from './telegram/telegram.service';

type NotifyNewOrderJobData = {
  telegramId: string;
  order: {
    id: string;
    title: string;
    districtName: string;
    specialtyName: string;
    price: number;
    scheduledAt: string | null;
  };
};

type NotifyOrderAssignedJobData = {
  telegramId: string;
  order: {
    id: string;
    title: string;
  };
  masterName: string;
};

type NotificationJob =
  | Job<NotifyNewOrderJobData, void, 'notify-new-order'>
  | Job<NotifyOrderAssignedJobData, void, 'notify-order-assigned'>;

@Injectable()
@Processor('notifications', {
  limiter: {
    max: 20,
    duration: 1000,
  },
})
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: NotificationJob): Promise<void> {
    const jobMeta = {
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    };

    try {
      switch (job.name) {
        case 'notify-new-order': {
          const { telegramId, order } = job.data;
          const scheduledAt = order.scheduledAt
            ? new Date(order.scheduledAt)
            : null;

          const messageId = await this.telegramService.sendOrderNotification(
            telegramId,
            { ...order, scheduledAt },
          );

          if (messageId === null) {
            this.logger.warn({
              ...jobMeta,
              event: 'telegram.sendOrderNotification.skipped',
              telegramId,
              orderId: order.id,
              reason: 'telegram_returned_null',
            });
            return;
          }

          this.logger.log({
            ...jobMeta,
            event: 'telegram.sendOrderNotification.sent',
            telegramId,
            orderId: order.id,
            messageId,
          });
          return;
        }
        case 'notify-order-assigned': {
          const { telegramId, order, masterName } = job.data;

          await this.telegramService.sendOrderAssignedNotification(
            telegramId,
            order,
            masterName,
          );

          this.logger.log({
            ...jobMeta,
            event: 'telegram.sendOrderAssignedNotification.sent',
            telegramId,
            orderId: order.id,
          });
          return;
        }
        default: {
          this.logger.warn({
            ...jobMeta,
            event: 'notifications.unknown_job',
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error({
        ...jobMeta,
        event: 'notifications.failed',
        error: message,
      });

      throw error;
    }
  }
}
