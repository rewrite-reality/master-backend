import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, OutboxStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { AmoCrmApiService } from './amocrm.api.service';

type OutboxPayload = {
  pipelineId?: number;
  statusId: number;
  orderStatus?: string;
};

@Injectable()
@Processor('amocrm-sync')
export class AmoCrmSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AmoCrmSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: AmoCrmApiService,
  ) {
    super();
  }

  async process(job: Job<{ outboxId: string }>): Promise<void> {
    const { outboxId } = job.data;
    const now = new Date();

    const outbox = await this.prisma.integrationOutbox.findUnique({
      where: { id: outboxId },
    });

    if (!outbox) {
      this.logger.warn(`Outbox ${outboxId} not found`);
      return;
    }

    if (outbox.status === OutboxStatus.SUCCESS) {
      return;
    }

    if (outbox.nextRetryAt && outbox.nextRetryAt > now) {
      return;
    }

    const payload = outbox.payload as unknown as OutboxPayload | null;
    if (!payload?.statusId) {
      this.logger.warn(
        `Outbox ${outboxId} missing statusId payload, marking failed`,
      );
      await this.prisma.integrationOutbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.FAILED,
          lastError: 'Missing statusId in payload',
          attempts: outbox.attempts + 1,
          nextRetryAt: now,
        },
      });
      return;
    }

    await this.prisma.integrationOutbox.update({
      where: { id: outboxId },
      data: { status: OutboxStatus.PROCESSING },
    });

    const eventPayload = {
      leadId: outbox.amoLeadId,
      statusId: payload.statusId,
      pipelineId: payload.pipelineId,
      outboxId: outbox.id,
    };

    try {
      const ok = await this.api.updateLeadStatus({
        leadId: outbox.amoLeadId,
        statusId: payload.statusId,
        pipelineId: payload.pipelineId,
      });

      if (!ok) {
        throw new Error('AmoCRM updateLeadStatus returned false');
      }

      await this.prisma.integrationEvent.create({
        data: {
          source: IntegrationProvider.AMOCRM,
          direction: 'OUTGOING',
          event: 'leads.status_update',
          payload: eventPayload,
          isSuccess: true,
        },
      });

      await this.prisma.integrationOutbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.SUCCESS,
          attempts: outbox.attempts + 1,
          lastError: null,
          nextRetryAt: now,
        },
      });
    } catch (error: any) {
      const attempts = outbox.attempts + 1;
      const backoffSeconds = attempts <= 3 ? attempts * 10 : 60;
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
      const message = error?.message || 'Unknown error';

      await this.prisma.integrationEvent.create({
        data: {
          source: IntegrationProvider.AMOCRM,
          direction: 'OUTGOING',
          event: 'leads.status_update',
          payload: { ...eventPayload, error: message },
          error: message,
          isSuccess: false,
        },
      });

      await this.prisma.integrationOutbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.FAILED,
          attempts,
          lastError: message,
          nextRetryAt,
        },
      });

      throw error;
    }
  }
}
