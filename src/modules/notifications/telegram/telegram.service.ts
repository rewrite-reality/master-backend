import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Markup } from 'telegraf';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Уведомление о новом заказе (для мастеров)
   * Возвращает messageId для возможности последующего редактирования (удаления кнопок)
   */
  async sendOrderNotification(
    telegramId: string | number,
    order: {
      id: string;
      title: string;
      districtName: string;
      specialtyName: string;
      price: number;
      scheduledAt: Date | null;
    },
  ): Promise<number | null> {
    const timeString = order.scheduledAt
      ? order.scheduledAt.toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '⚡️ Как можно скорее';

    const message =
      `<b>🔥 Новый заказ!</b>\n\n` +
      `📋 <b>${order.title}</b>\n` +
      `📍 Район: ${order.districtName}\n` +
      `🔧 Спец: ${order.specialtyName}\n` +
      `💰 Цена: <b>${order.price}₽</b>\n` +
      `⏰ Время: ${timeString}`;

    // Получаем URL и страхуемся от undefined
    const baseUrl = this.configService.get<string>('TELEGRAM_MINI_APP_URL');
    if (!baseUrl) {
      this.logger.error('TELEGRAM_MINI_APP_URL is not defined in .env');
    }

    // Формируем ссылку: https://t.me/botname/appname?startapp=order_UUID
    // Или прямую ссылку, если используешь Web App Direct Link
    const webAppUrl = `${baseUrl}/orders/${order.id}`;

    try {
      const sentMessage = await this.bot.telegram.sendMessage(
        telegramId,
        message,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              // Кнопка 1: Моментальное действие (вызывает callback-хендлер в боте)
              Markup.button.callback(
                `⚡️ Принять за ${order.price}₽`,
                `accept_order:${order.id}`,
              ),
            ],
            [
              // Кнопка 2: Открывает Mini App
              Markup.button.webApp('📱 Подробнее / Карта', webAppUrl),
            ],
          ]),
        },
      );

      this.logger.log(
        `[TelegramService] Notification sent to ${telegramId} (msg: ${sentMessage.message_id})`,
      );
      return sentMessage.message_id;
    } catch (error) {
      this.logger.error(
        `[TelegramService] Failed to send to ${telegramId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Уведомление о назначении (для менеджера или мастера)
   */
  async sendOrderAssignedNotification(
    telegramId: string | number,
    order: { id: string; title: string },
    masterName: string,
  ): Promise<void> {
    const message =
      `✅ <b>Заказ принят!</b>\n\n` +
      `Мастер <b>${masterName}</b> принял заказ "${order.title}"`;

    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
      });
      this.logger.log(
        `[TelegramService] Sent assigned notification to ${telegramId} for order ${order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[TelegramService] Failed to send assigned notification to ${telegramId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Удаление кнопок у сообщения (используется, когда заказ перехвачен)
   */
  async disableOrderButtons(telegramId: string | number, messageId: number) {
    try {
      await this.bot.telegram.editMessageReplyMarkup(
        telegramId,
        messageId,
        undefined,
        {
          inline_keyboard: [], // Пустой массив удаляет кнопки
        },
      );
    } catch (e) {
      // Игнорируем ошибку "Message is not modified" или если сообщение удалено юзером
    }
  }
}
