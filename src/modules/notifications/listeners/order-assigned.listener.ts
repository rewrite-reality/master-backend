
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { OrderAssignedEvent } from '../../orders/events/order-assigned.event';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderAssignedListener {
	private readonly logger = new Logger(OrderAssignedListener.name);

	constructor(
		private readonly telegramService: TelegramService,
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) { }

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
			const managerTelegramId = this.configService.get<string>('MANAGER_TELEGRAM_ID');

			if (managerTelegramId) {
				const masterName = order.master.user.email || `ID ${order.master.id}`;
				await this.telegramService.sendOrderAssignedNotification(
					Number(managerTelegramId),
					{ id: order.id, title: order.title },
					masterName,
				);
				this.logger.log(
					`[OrderAssignedListener] Notified manager about order ${order.id}`,
				);
			}
		} catch (error) {
			this.logger.error(
				`[OrderAssignedListener] Error handling order.assigned: ${error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}
