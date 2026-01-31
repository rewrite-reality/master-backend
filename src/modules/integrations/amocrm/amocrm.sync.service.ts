import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  IntegrationProvider,
  OutboxEventType,
  OutboxStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';

const AMO_PIPELINE_ID = 10530894;

@Injectable()
export class AmoCrmSyncService {
  private readonly logger = new Logger(AmoCrmSyncService.name);

  constructor(
    @InjectQueue('amocrm-sync')
    private readonly queue: Queue,
  ) {}

  resolveAmoStatusId(status: OrderStatus): number | null {
    switch (status) {
      // Можно добавить маппинг для PENDING, если он соответствует "НЕРАЗОБРАННОЕ" или "ОТПРАВИТЬ В ПОИСК"
      // case OrderStatus.PENDING:
      //   return 83094082; // "ОТПРАВИТЬ В ПОИСК"

      case OrderStatus.ASSIGNED:
        return 83093934; // "МАСТЕР НАЙДЕН"
      case OrderStatus.ARRIVED:
        return 83093938; // "МАСТЕР НА МЕСТЕ"
      case OrderStatus.IN_PROGRESS:
        return 83093942; // "РАБОТАЕТ"
      case OrderStatus.REVIEW:
        return 83093946; // "НА ПРОВЕРКЕ"
      case OrderStatus.COMPLETED:
        return 142; // "Успешно реализовано"
      case OrderStatus.CANCELLED:
        return 143; // "Закрыто и не реализовано"

      case OrderStatus.PENDING:
      case OrderStatus.DISPUTE:
      default:
        return null;
    }
  }

  async enqueueLeadMove(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      amoLeadId?: string | null;
      orderStatus: OrderStatus;
    },
  ) {
    const { orderId, amoLeadId, orderStatus } = params;
    const statusId = this.resolveAmoStatusId(orderStatus);

    if (!statusId) {
      this.logger.debug(
        `No AmoCRM status mapping for ${orderStatus}, skipping outbox`,
      );
      return;
    }

    if (!amoLeadId) {
      this.logger.warn(
        `Order ${orderId} missing amoLeadId; cannot enqueue AmoCRM move`,
      );
      return;
    }

    const dedupeKey = `amo:lead-move:${amoLeadId}:${statusId}`;
    const payload = { pipelineId: AMO_PIPELINE_ID, statusId, orderStatus };

    const outbox = await tx.integrationOutbox.upsert({
      where: { dedupeKey },
      create: {
        provider: IntegrationProvider.AMOCRM,
        type: OutboxEventType.AMOCRM_LEAD_MOVE,
        status: OutboxStatus.PENDING,
        orderId,
        amoLeadId,
        payload,
        dedupeKey,
        attempts: 0,
        nextRetryAt: new Date(),
      },
      update: {
        status: OutboxStatus.PENDING,
        payload,
        lastError: null,
        nextRetryAt: new Date(),
      },
    });

    try {
      await this.queue.add(
        'sync',
        { outboxId: outbox.id },
        { jobId: outbox.id, removeOnComplete: 1000, removeOnFail: 1000 },
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to enqueue AmoCRM outbox job for ${dedupeKey}: ${error?.message || error}`,
      );
    }
  }
}
