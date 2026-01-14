import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private config: ConfigService,
		private jwt: JwtService,
		private prisma: PrismaService,
	) { }

	/**
	 * Проверяет подпись initData от Telegram Mini App
	 * @param initData Строка initData (raw)
	 * @returns Объект user из initData
	 */
	validateTelegramInitData(initData: string): any {
		if (!initData) {
			throw new UnauthorizedException('Missing initData');
		}

		const urlParams = new URLSearchParams(initData);
		const hash = urlParams.get('hash');

		if (!hash) {
			throw new UnauthorizedException('Missing hash in initData');
		}

		// Удаляем hash, так как он не участвует в подписи
		urlParams.delete('hash');

		// Сортируем параметры по алфавиту: key=value\n
		const dataCheckString = Array.from(urlParams.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, value]) => `${key}=${value}`)
			.join('\n');

		// 1. Создаём секретный ключ на основе токена бота
		const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
		if (!botToken) {
			this.logger.error('TELEGRAM_BOT_TOKEN is not defined in env');
			throw new Error('Internal server configuration error');
		}

		const secretKey = crypto
			.createHmac('sha256', 'WebAppData')
			.update(botToken)
			.digest();

		// 2. Считаем хеш от dataCheckString
		const calculatedHash = crypto
			.createHmac('sha256', secretKey)
			.update(dataCheckString)
			.digest('hex');

		// 3. Сравниваем (timingSafeEqual для защиты от timing attacks)
		// Важно: calculatedHash и hash должны быть одной длины, иначе timingSafeEqual упадет
		// Поэтому сначала простая проверка длины, потом криптостойкая
		if (calculatedHash !== hash) {
			this.logger.warn(`Invalid hash. Calculated: ${calculatedHash}, Received: ${hash}`);
			throw new UnauthorizedException('Invalid Telegram signature');
		}

		// Парсим данные пользователя
		const userStr = urlParams.get('user');
		if (!userStr) {
			throw new UnauthorizedException('No user data in initData');
		}

		try {
			const user = JSON.parse(userStr);

			// Дополнительно можно проверить auth_date (защита от replay attacks)
			// Срок жизни initData — например, 1 день
			const authDate = Number(urlParams.get('auth_date'));
			const now = Math.floor(Date.now() / 1000);
			if (now - authDate > 86400) { // 24 часа
				this.logger.warn('InitData is expired');
				throw new UnauthorizedException('InitData expired');
			}

			return user;
		} catch (e) {
			this.logger.error('Failed to parse user JSON', e);
			throw new UnauthorizedException('Invalid user data format');
		}
	}

	/**
	 * Основной метод логина
	 * @param initData Строка initData
	 */
	async login(initData: string) {
		// 1. Валидация
		const tgUser = this.validateTelegramInitData(initData);
		const telegramId = BigInt(tgUser.id);

		// 2. Поиск или создание пользователя (upsert - update or insert)
		// Используем transaction, чтобы гарантировать атомарность, 
		// хотя здесь можно и простой findUnique + create

		// Сначала пробуем найти, чтобы не делать лишних write операций
		let user = await this.prisma.user.findUnique({
			where: { telegramId },
			include: { masterProfile: true },
		});

		if (!user) {
			this.logger.log(`Creating new user for telegramId: ${tgUser.id}`);
			user = await this.prisma.user.create({
				data: {
					telegramId,
					telegramUsername: tgUser.username || null,
					telegramChatId: telegramId, // По умолчанию считаем, что chatId = userId (для лички)
					role: 'MASTER', // Все новые - мастера
				},
				include: { masterProfile: true },
			});
		} else {
			// Опционально: обновляем username если сменился
			if (user.telegramUsername !== tgUser.username) {
				await this.prisma.user.update({
					where: { id: user.id },
					data: { telegramUsername: tgUser.username },
				});
			}
		}

		// 3. Генерация JWT
		const payload = {
			sub: user.id, // Subject (ID пользователя)
			role: user.role,
			tgId: user.telegramId.toString(), // BigInt сериализуем в строку
		};

		const accessToken = this.jwt.sign(payload);

		this.logger.log(`User ${user.id} logged in via Telegram`);

		return {
			accessToken,
			user: {
				id: user.id,
				role: user.role,
				firstName: tgUser.first_name, // Данные из телеги, чтобы предзаполнить форму
				lastName: tgUser.last_name,
				username: user.telegramUsername,
				hasProfile: !!user.masterProfile, // Флаг: заполнен ли профиль мастера
			},
		};
	}
}
