import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import { verifyTelegramInitData } from '../../core/telegram/init-data';
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

		// на всякий: иногда прилетает tgWebAppData=...
		const cleaned = initData.startsWith('tgWebAppData=')
			? initData.slice('tgWebAppData='.length)
			: initData;

		try {
			const parsed = verifyTelegramInitData(cleaned);

			// parsed.user — объект Telegram user
			const user = parsed?.user;

			if (!user || typeof user !== 'object') {
				throw new UnauthorizedException('No user data in initData');
			}

			// optional anti-replay (в секундах)
			const authDate = (parsed as any)?.authDate;
			if (typeof authDate === 'number') {
				const nowSec = Math.floor(Date.now() / 1000);
				const maxAge =
					Number(this.config.get<string>('INIT_DATA_MAX_AGE')) || 3600;

				if (nowSec - authDate > maxAge) {
					this.logger.warn(
						`InitData is expired. now=${nowSec}, auth_date=${authDate}, age=${nowSec - authDate}, maxAge=${maxAge}`,
					);
					throw new UnauthorizedException('InitData expired');
				}
			}

			return user;
		} catch (e: any) {
			// validate() кидает ошибку — превращаем в 401
			this.logger.warn(`Invalid initData: ${e?.message ?? e}`);
			throw new UnauthorizedException('Invalid Telegram signature');
		}
	}


	private normalizeInitData(rawInitData: string): string {
		let normalized = rawInitData.trim();

		if (normalized.startsWith('tgWebAppData=')) {
			normalized = normalized.slice('tgWebAppData='.length);
		}

		const looksEncoded = /%(3D|26|2B|7B|7D|22|25)/i.test(normalized);
		if (looksEncoded) {
			try {
				const decoded = decodeURIComponent(normalized);
				if (decoded.includes('=') && decoded.includes('&')) {
					normalized = decoded;
				}
			} catch (error) {
				this.logger.warn(`Failed to decode initData, using raw value. Reason: ${(error as Error).message}`);
			}
		}

		return normalized;
	}

	private safeDecodeURIComponent(value: string): string {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	private getInitDataMaxAge(): number {
		const configured = this.config.get('INIT_DATA_MAX_AGE');
		const parsed = typeof configured === 'string' ? Number(configured) : Number(configured);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
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
