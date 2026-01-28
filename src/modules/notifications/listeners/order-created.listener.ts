import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { TelegramService } from '../telegram/telegram.service';
import { OrderCreatedEvent } from '../../dispatch/events/order-created.event';

@Injectable()
export class OrderCreatedListener {
  private readonly logger = new Logger(OrderCreatedListener.name);

  constructor(
    private readonly dispatchService: DispatchService,
    private readonly telegramService: TelegramService,
    private readonly prisma: PrismaService,
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
        scheduledAt: order.scheduledAt,
      };

      // 3. Notify each master
      let sentCount = 0;
      for (const master of masters) {
        if (master.user && master.user.telegramId) {
          // Convert BigInt to number if needed, assuming telegramId is stored as BigInt but needed as number by Telegraf
          // Prisma BigInt is usually handled, checking schema would be good but standard approach:
          const telegramId = Number(master.user.telegramId);
          await this.telegramService.sendOrderNotification(
            telegramId,
            orderData,
          );
          sentCount++;
        }
      }

      this.logger.log(
        `[OrderCreatedListener] Sent notifications to ${sentCount} masters for order ${event.orderId}`,
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
