import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import Redis from 'ioredis';

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
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
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
    // 0. Валидация структуры payload
    if (!payload?.sub || !payload?.role) {
      this.logger.error('Invalid JWT payload structure', payload);
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.role === 'MASTER' && !payload.tgId) {
      this.logger.warn('Missing tgId for master token payload');
      throw new UnauthorizedException('Invalid token payload');
    }

    // 1. Пробуем получить из кеша
    const cacheKey = `user:${payload.sub}`;
    const cachedUser = await this.redis.get(cacheKey);

    if (cachedUser) {
      const user = JSON.parse(cachedUser);

      // Проверка роли (защита от старых токенов после смены роли)
      if (user.role !== payload.role) {
        throw new UnauthorizedException('Role mismatch');
      }

      // Дополнительная проверка: если юзер заблокирован (для мастеров)
      if (user.role === 'MASTER' && user.masterProfile?.status === 'BLOCKED') {
        throw new UnauthorizedException('Your account is blocked');
      }

      return user;
    }

    // 2. Cache miss — идем в базу
    const start = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        masterProfile: true, // Подгружаем профиль мастера (может быть null)
      },
    });
    const duration = Date.now() - start;
    if (duration > 50) {
      this.logger.warn(`Slow DB query in JwtStrategy: ${duration}ms`);
    }

    if (!user) {
      this.logger.warn(
        `Token validation failed: user ${payload.sub} not found`,
      );
      throw new UnauthorizedException('User not found');
    }

    // Дополнительная проверка: если юзер заблокирован (для мастеров)
    if (user.role === 'MASTER' && user.masterProfile?.status === 'BLOCKED') {
      this.logger.warn(`Blocked master ${user.id} tried to access`);
      throw new UnauthorizedException('Your account is blocked');
    }

    // 3. Сохраняем в кеш (5 минут)
    await this.redis.set(
      cacheKey,
      JSON.stringify(user, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
      'EX',
      300,
    );

    return user;
  }
}
