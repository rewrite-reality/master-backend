import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { OrderCreatedEvent } from '../../dispatch/events/order-created.event';

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

@Injectable()
export class OrderCreatedListener {
  private readonly logger = new Logger(OrderCreatedListener.name);

  constructor(
    private readonly dispatchService: DispatchService,
    private readonly prisma: PrismaService,
    @InjectQueue('notifications')
    private readonly notificationsQueue: Queue<NotifyNewOrderJobData>,
  ) {}

  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent) {
    try {
      // 1. Get eligible masters
      const masters = await this.dispatchService.findEligibleMasters(
        event.orderId,
      );

      if (masters.length === 0) {
        this.logger.log(
          `[OrderCreatedListener] No eligible masters found for order ${event.orderId}`,
        );
        return;
      }

      // 2. Get full order data
      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        include: {
          district: true,
          specialty: true,
        },
      });

      if (!order) {
        this.logger.error(
          `[OrderCreatedListener] Order ${event.orderId} not found`,
        );
        return;
      }

      const orderData = {
        id: order.id,
        title: order.title,
        districtName: order.district.name,
        specialtyName: order.specialty?.name || 'Общая',
        price: Number(order.price),
        scheduledAt: order.scheduledAt ? order.scheduledAt.toISOString() : null,
      };

      // 3. Queue notifications for each master
      const jobs: Array<{
        name: 'notify-new-order';
        data: NotifyNewOrderJobData;
        opts: { jobId: string };
      }> = [];

      for (const master of masters) {
        if (
          master.user?.telegramId !== null &&
          master.user?.telegramId !== undefined
        ) {
          const telegramId = String(master.user.telegramId);
          jobs.push({
            name: 'notify-new-order',
            data: { telegramId, order: orderData },
            opts: { jobId: `notify-new-order-${order.id}-${telegramId}` },
          });
        }
      }

      if (jobs.length === 0) {
        this.logger.log(
          `[OrderCreatedListener] No telegram IDs found for order ${event.orderId}`,
        );
        return;
      }

      await this.notificationsQueue.addBulk(jobs);

      this.logger.log(
        `[OrderCreatedListener] Queued ${jobs.length} notifications for order ${event.orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `[OrderCreatedListener] Error handling order.created: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
