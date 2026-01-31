import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { OrderAssignedEvent } from '../../orders/events/order-assigned.event';

type NotifyOrderAssignedJobData = {
  telegramId: string;
  order: {
    id: string;
    title: string;
  };
  masterName: string;
};

@Injectable()
export class OrderAssignedListener {
  private readonly logger = new Logger(OrderAssignedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue('notifications')
    private readonly notificationsQueue: Queue<NotifyOrderAssignedJobData>,
  ) {}

  @OnEvent('order.assigned')
  async handleOrderAssigned(event: OrderAssignedEvent) {
    try {
      // 1. Get order with master
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: { master: { include: { user: true } } },
      });

      if (!order || !order.master) {
        this.logger.error(
          `[OrderAssignedListener] Order ${event.orderId} or master not found`,
        );
        return;
      }

      // 2. Find manager (using env for now as requested)
      const managerTelegramId = this.configService.get<string>(
        'MANAGER_TELEGRAM_ID',
      );

      if (!managerTelegramId) {
        this.logger.warn(
          `[OrderAssignedListener] MANAGER_TELEGRAM_ID is not configured`,
        );
        return;
      }

      const masterName = order.master.user.email || `ID ${order.master.id}`;
      const telegramId = String(managerTelegramId);

      await this.notificationsQueue.add(
        'notify-order-assigned',
        {
          telegramId,
          order: { id: order.id, title: order.title },
          masterName,
        },
        { jobId: `notify-order-assigned-${order.id}-${telegramId}` },
      );

      this.logger.log(
        `[OrderAssignedListener] Queued manager notification for order ${order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[OrderAssignedListener] Error handling order.assigned: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
