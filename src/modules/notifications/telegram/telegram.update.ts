
import { Update, Start, Ctx } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Logger } from '@nestjs/common';

@Update()
export class TelegramUpdate {
	private readonly logger = new Logger(TelegramUpdate.name);

	@Start()
	async start(@Ctx() ctx: Context) {
		const telegramId = ctx.from?.id;
		await ctx.reply(
			'Добро пожаловать в "Мастер на час"!\n\n' +
			'Здесь вы будете получать уведомления о новых заказах.',
		);

		this.logger.log(`[TelegramUpdate] User ${telegramId} started bot`);
	}
}
