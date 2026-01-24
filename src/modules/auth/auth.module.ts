import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';

/**
 * Модуль авторизации
 * Отвечает за вход через Telegram Mini App и защиту роутов через JWT
 */
@Module({
	imports: [
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.getOrThrow<string>('JWT_SECRET'),
				signOptions: {
					expiresIn: '7d',
					issuer: 'master-na-chas',
				},
			}),
		}),
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		JwtStrategy,
		RolesGuard,
	],
	exports: [
		JwtStrategy,
		PassportModule,
		RolesGuard,
	],
})
export class AuthModule { }
