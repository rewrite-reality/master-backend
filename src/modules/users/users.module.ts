import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * Модуль для работы с пользователями (мастерами)
 * Отвечает за профиль, настройки и привязку районов
 */
@Module({
	imports: [], // Внешних модулей не нужно (Prisma глобальная)
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService], // Экспортируем сервис, чтобы AuthModule мог проверять профиль при логине (если понадобится)
})
export class UsersModule { }
