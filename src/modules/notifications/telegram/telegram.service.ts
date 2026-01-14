
import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService {
	private readonly logger = new Logger(TelegramService.name);

	constructor(@InjectBot() private readonly bot: Telegraf) { }

	async sendOrderNotification(
		telegramId: number,
		order: {
			id: string;
			title: string;
			districtName: string;
			specialtyName: string;
			price: number;
			scheduledAt: Date | null;
		},
	): Promise<void> {
		const timeString = order.scheduledAt
			? order.scheduledAt.toLocaleString('ru-RU', {
				day: 'numeric',
				month: 'long',
				hour: '2-digit',
				minute: '2-digit',
			})
			: 'Как можно скорее';

		const message =
			`🔥 Новый заказ!\n\n` +
			`📋 ${order.title}\n` +
			`📍 Район: ${order.districtName}\n` +
			`🔧 Специальность: ${order.specialtyName}\n` +
			`💰 Цена: ${order.price}₽\n` +
			`⏰ Время: ${timeString}`;

		try {
			await this.bot.telegram.sendMessage(telegramId, message);
			this.logger.log(
				`[TelegramService] Sent notification to master ${telegramId} for order ${order.id}`,
			);
		} catch (error) {
			this.logger.error(
				`[TelegramService] Failed to send notification to ${telegramId}: ${error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	async sendOrderAssignedNotification(
		telegramId: number,
		order: { id: string; title: string },
		masterName: string,
	): Promise<void> {
		const message =
			`✅ Заказ принят!\n\n` +
			`Мастер ${masterName} принял заказ "${order.title}"`;

		try {
			await this.bot.telegram.sendMessage(telegramId, message);
			this.logger.log(
				`[TelegramService] Sent assigned notification to ${telegramId} for order ${order.id}`,
			);
		} catch (error) {
			this.logger.error(
				`[TelegramService] Failed to send assigned notification to ${telegramId}: ${error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}
