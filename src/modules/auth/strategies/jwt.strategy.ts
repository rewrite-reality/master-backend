import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * JWT Strategy для проверки токена в защищенных роутах
 * Автоматически вызывается через @UseGuards(JwtAuthGuard)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	private readonly logger = new Logger(JwtStrategy.name);

	constructor(
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
			ignoreExpiration: false,
		});

	}

	/**
	 * Метод validate вызывается автоматически, если токен валидный
	 * @param payload Данные из JWT (sub, role, tgId)
	 * @returns Объект user, который попадёт в request.user
	 */
	async validate(payload: any) {
		// Payload содержит: { sub: userId, role: 'MASTER', tgId: '123456', iat: ..., exp: ... }

		// Проверяем, что токен не сгенерирован для несуществующего юзера
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
			include: {
				masterProfile: true, // Подгружаем профиль мастера (может быть null)
			},
		});

		if (!user) {
			this.logger.warn(`Token validation failed: user ${payload.sub} not found`);
			throw new UnauthorizedException('User not found');
		}

		// Дополнительная проверка: если юзер заблокирован (для мастеров)
		if (user.role === 'MASTER' && user.masterProfile?.status === 'BLOCKED') {
			this.logger.warn(`Blocked master ${user.id} tried to access`);
			throw new UnauthorizedException('Your account is blocked');
		}

		// Этот объект попадёт в request.user и будет доступен через @CurrentUser()
		return user;
	}
}
