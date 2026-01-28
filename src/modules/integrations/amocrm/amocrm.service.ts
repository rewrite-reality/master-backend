import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AmoWebhookDto } from './dto/amocrm-webhook.dto';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class AmoCrmService {
  private readonly logger = new Logger(AmoCrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('amocrm-webhooks')
    private readonly webhookQueue: Queue,
  ) {}

  async handleIncomingWebhook(dto: AmoWebhookDto) {
    this.prisma.integrationEvent
      .create({
        data: {
          source: 'AMOCRM',
          direction: 'INCOMING',
          event: dto.leads?.status ? 'leads.status' : 'leads.add',
          payload: JSON.parse(JSON.stringify(dto)),
          isSuccess: true,
        },
      })
      .catch((e) =>
        this.logger.error('Failed to log IntegrationEvent', e.stack),
      );

    let hasRelevantPayload = false;

    if (dto.leads?.status) {
      hasRelevantPayload = true;
      for (const lead of dto.leads.status) {
        try {
          await this.webhookQueue.add('process-status', { lead });
        } catch (error: any) {
          this.logger.error(
            `Failed to enqueue process-status job for lead ${lead?.id}: ${error?.message || error}`,
            error?.stack,
          );
        }
      }
    }

    if (dto.leads?.add) {
      hasRelevantPayload = true;
      for (const lead of dto.leads.add) {
        try {
          await this.webhookQueue.add('process-add', { lead });
        } catch (error: any) {
          this.logger.error(
            `Failed to enqueue process-add job for lead ${lead?.id}: ${error?.message || error}`,
            error?.stack,
          );
        }
      }
    }

    if (hasRelevantPayload) {
      return { status: 'queued' };
    }

    return { status: 'ignored_event' };
  }
}
