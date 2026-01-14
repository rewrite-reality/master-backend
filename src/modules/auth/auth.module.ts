import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Модуль авторизации
 * Отвечает за вход через Telegram Mini App и защиту роутов через JWT
 */
@Module({
	imports: [
		// Passport — библиотека для стратегий аутентификации
		PassportModule.register({ defaultStrategy: 'jwt' }),

		// JWT модуль с асинхронной конфигурацией (читаем секрет из .env)
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.getOrThrow<string>('JWT_SECRET'), // Секрет для подписи токена
				signOptions: {
					expiresIn: '7d', // Токен живёт 7 дней
					issuer: 'master-na-chas', // (Опционально) Кто выдал токен
				},
			}),
		}),
	],
	controllers: [AuthController], // HTTP эндпоинты (POST /auth/login)
	providers: [
		AuthService, // Бизнес-логика авторизации
		JwtStrategy, // Стратегия проверки токена (для Guard)
	],
	exports: [
		JwtStrategy, // Экспортируем, чтобы другие модули могли использовать @UseGuards(JwtAuthGuard)
		PassportModule, // Экспортируем Passport на случай, если понадобится в других модулях
	],
})
export class AuthModule { }
