import { Update, Start, Ctx, Action } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import {
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // Добавляем ConfigService
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { TelegramService } from './telegram.service';

// Тип для безопасного доступа к message_id
type CallbackWithMesage = { message: { message_id: number } };

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService, // Инжектим конфиг для URL
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id;
    await ctx.reply(
      'Добро пожаловать в "Мастер на час"!\n\n' +
        'Здесь вы будете получать уведомления о новых заказах.',
    );
    this.logger.log(`[TelegramUpdate] User ${telegramId} started bot`);
  }

  @Action(/accept_order:(.+)/)
  async onAcceptOrder(@Ctx() ctx: Context) {
    // @ts-ignore
    const orderId = ctx.match[1];
    const telegramId = ctx.from?.id;
    const messageId = ctx.callbackQuery?.message?.message_id;

    if (!telegramId || !orderId || !messageId) return;

    await ctx.answerCbQuery('⚡️ Обработка заявки...');

    try {
      const user = await this.prisma.user.findFirst({
        where: { telegramId: BigInt(telegramId) },
        select: { id: true },
      });

      if (!user) {
        await ctx.answerCbQuery('❌ Вы не зарегистрированы', {
          show_alert: true,
        });
        return;
      }

      // 4. Пытаемся принять заказ
      // Метод вернет нам объект с результатом, можно его расширить, если нужно
      await this.ordersService.acceptOrder(orderId, user.id);

      // Формируем ссылку на заказ
      const baseUrl =
        this.configService.get<string>('TELEGRAM_MINI_APP_URL') ||
        'https://example.com';
      const webAppUrl = `${baseUrl}/orders/${orderId}`;

      // 5. Успех! Редактируем сообщение красиво.
      // Оставляем текст понятным, но меняем статус.
      // Если у тебя в OrdersService есть метод getOne, можно подтянуть свежие данные (адрес и т.д.)
      // Но для скорости просто меняем заголовок.

      const successMessage =
        `✅ <b>Вы приняли этот заказ!</b>\n\n` +
        `Теперь он закреплен за вами. Нажмите кнопку ниже, чтобы увидеть детали, адрес и контакты клиента.`;

      await ctx.editMessageText(successMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('📱 Открыть заказ', webAppUrl)],
        ]),
      });

      // Примечание: Мы НЕ вызываем disableOrderButtons здесь,
      // потому что editMessageText выше УЖЕ перезаписал клавиатуру на новую (с кнопкой "Открыть").
      // Старая кнопка "Принять" исчезла автоматически.
    } catch (error) {
      this.logger.warn(`Failed to accept order ${orderId}: ${error.message}`);

      let message = '❌ Не удалось принять заказ';

      if (error instanceof ConflictException) {
        message = '🏎 Упс! Заказ уже забрали.';
        // Если неудача - просто убираем кнопки
        await this.telegramService.disableOrderButtons(telegramId, messageId);
        try {
          await ctx.editMessageText(
            '❌ <b>Заказ перехвачен другим мастером</b>\n\nНе расстраивайтесь, скоро появятся новые!',
            { parse_mode: 'HTML' },
          );
        } catch (e) {
          /* ignore */
        }
      } else if (error instanceof ForbiddenException) {
        message = '🚫 Вам недоступен этот заказ.';
      }

      await ctx.answerCbQuery(message, { show_alert: true });
    }
  }
}
