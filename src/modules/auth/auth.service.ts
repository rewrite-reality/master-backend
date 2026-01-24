import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';
import { verifyTelegramInitData } from '../../core/telegram/init-data';
import { Redis } from 'ioredis';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);
	// TTL для кэша сессии в Redis (1 час - чтобы обновлять данные не слишком часто, но и не вечно)
	private readonly SESSION_TTL = 3600;

	constructor(
		private config: ConfigService,
		private jwt: JwtService,
		private prisma: PrismaService,
		@Inject('REDIS_CLIENT') private readonly redis: Redis,
	) { }

	/**
	 * Инвалидация кеша (например, при смене роли или блокировке)
	 */
	async invalidateUserCache(telegramId: bigint | string) {
		await this.redis.del(`session:tg:${telegramId}`);
		this.logger.log(`Invalidated session cache for tgId: ${telegramId}`);
	}

	/**
	 * Основной метод логина (ОПТИМИЗИРОВАННЫЙ)
	 */
	async login(initData: string) {
		// 1. Валидация подписи (CPU only, без БД)
		const tgUser = this.validateTelegramInitData(initData);
		const telegramId = BigInt(tgUser.id);
		const redisKey = `session:tg:${telegramId}`;

		// 2. CHECK CACHE: Пытаемся отдать ответ мгновенно из Redis
		const cachedSession = await this.redis.get(redisKey);
		if (cachedSession) {
			// Если кэш есть - парсим и отдаем. 0 запросов к PostgreSQL!
			return JSON.parse(cachedSession);
		}

		// 3. READ FIRST: Если кэша нет, читаем БД (SELECT намного дешевле UPDATE)
		let user = await this.prisma.user.findUnique({
			where: { telegramId },
			include: { masterProfile: true },
		});

		// 4. WRITE ONLY IF NEEDED: Логика создания или обновления
		if (!user) {
			// Сценарий 1: Новый пользователь (CREATE)
			user = await this.prisma.user.create({
				data: {
					telegramId,
					telegramUsername: tgUser.username || null,
					role: 'MASTER',
					masterProfile: {
						create: {
							firstName: tgUser.first_name || '',
							lastName: tgUser.last_name || '',
							phone: '',
							status: 'PENDING',
						},
					},
				},
				include: { masterProfile: true },
			});
			this.logger.log(`New user created: ${user.id}`);
		} else {
			// Сценарий 2: Пользователь существует. Проверяем, изменились ли данные.
			const usernameChanged = user.telegramUsername !== (tgUser.username || null);

			if (usernameChanged) {
				// Пишем в БД (UPDATE) только если реально что-то поменялось
				user = await this.prisma.user.update({
					where: { id: user.id },
					data: {
						telegramUsername: tgUser.username || null
					},
					include: { masterProfile: true },
				});
			}
		}

		// 5. Генерация токена
		const payload = {
			sub: user.id,
			role: user.role,
			// FIX: Используем переменную telegramId из начала функции. 
			// Она точно существует, в отличие от поля в базе, которое TS считает nullable.
			tgId: telegramId.toString(),
		};

		const accessToken = this.jwt.sign(payload);


		// 6. Формируем ответ
		const response = {
			accessToken,
			user: {
				id: user.id,
				role: user.role,
				firstName: tgUser.first_name,
				lastName: tgUser.last_name,
				username: user.telegramUsername,
				hasProfile: !!user.masterProfile,
			},
		};

		// 7. CACHE SET: Запоминаем результат в Redis на 1 час
		// Используем 'EX' для автоматического удаления
		await this.redis.set(redisKey, JSON.stringify(response), 'EX', this.SESSION_TTL);

		return response;
	}

	// --- Вспомогательные методы (без изменений логики, только стиль) ---

	async validateAdmin(email: string, password: string) {
		const normalizedEmail = email.trim().toLowerCase();
		const user = await this.prisma.user.findUnique({
			where: { email: normalizedEmail },
		});

		if (!user || user.role !== 'ADMIN' || !user.passwordHash) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const passwordValid = await argon2.verify(user.passwordHash, password);
		if (!passwordValid) {
			throw new UnauthorizedException('Invalid credentials');
		}
		return user;
	}

	async loginAdmin(email: string, password: string) {
		const user = await this.validateAdmin(email, password);
		const payload = { sub: user.id, role: user.role };
		return {
			accessToken: this.jwt.sign(payload),
			user: { id: user.id, role: user.role, email: user.email },
		};
	}

	validateTelegramInitData(initData: string): any {
		if (!initData) throw new UnauthorizedException('Missing initData');

		const cleaned = initData.startsWith('tgWebAppData=')
			? initData.slice('tgWebAppData='.length)
			: initData;

		try {
			const parsed = verifyTelegramInitData(cleaned);
			const user = parsed?.user;

			if (!user || typeof user !== 'object') {
				throw new UnauthorizedException('No user data in initData');
			}

			const authDate = (parsed as any)?.authDate;
			if (typeof authDate === 'number') {
				const nowSec = Math.floor(Date.now() / 1000);
				const maxAge = this.getInitDataMaxAge();

				if (nowSec - authDate > maxAge) {
					throw new UnauthorizedException('InitData expired');
				}
			}
			return user;
		} catch (e: any) {
			this.logger.warn(`Invalid initData: ${e?.message ?? e}`);
			throw new UnauthorizedException('Invalid Telegram signature');
		}
	}

	private getInitDataMaxAge(): number {
		const configured = this.config.get('INIT_DATA_MAX_AGE');
		const parsed = Number(configured);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
	}
}
