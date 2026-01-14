import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import * as crypto from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private config: ConfigService,
		private jwt: JwtService,
		private prisma: PrismaService,
		@Inject('REDIS_CLIENT') private readonly redis: Redis,
	) { }

	/**
	 * Инвалидация кеша пользователя
	 * @param userId ID пользователя
	 */
	async invalidateUserCache(userId: string) {
		await this.redis.del(`user:${userId}`);
		this.logger.log(`Invalidated cache for user ${userId}`);
	}

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
		const calculatedHashBuffer = Buffer.from(calculatedHash, 'hex');
		const receivedHashBuffer = Buffer.from(hash, 'hex');

		if (
			calculatedHashBuffer.length !== receivedHashBuffer.length ||
			!crypto.timingSafeEqual(calculatedHashBuffer, receivedHashBuffer)
		) {
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
			// Срок жизни initData — например, 5 минут (300 сек)
			const authDate = Number(urlParams.get('auth_date'));
			const now = Math.floor(Date.now() / 1000);
			const maxAge = this.config.get<number>('INIT_DATA_MAX_AGE', 300); // Default 5 min

			if (now - authDate > maxAge) {
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
		// 2. Поиск или создание пользователя (upsert - update or insert)
		// Используем upsert для атомарности и предотвращения race condition
		const user = await this.prisma.user.upsert({
			where: { telegramId },
			create: {
				telegramId,
				telegramUsername: tgUser.username || null,
				telegramChatId: null, // chatId будет заполнен при первом взаимодействии с ботом
				role: 'MASTER', // Все новые - мастера
				masterProfile: {
					create: {
						// Создаем пустой профиль мастера, чтобы соблюсти инвариант
						firstName: tgUser.first_name || '',
						lastName: tgUser.last_name || '',
						phone: '', // Будет заполнено позже
						status: 'PENDING',
					}
				}
			},
			update: {
				telegramUsername: tgUser.username || null,
			},
			include: { masterProfile: true },
		});

		// 3. Генерация JWT
		if (!user.telegramId) {
			throw new Error('User does not have telegramId');
		}

		const payload = {
			sub: user.id,
			role: user.role,
			tgId: user.telegramId.toString(),
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
