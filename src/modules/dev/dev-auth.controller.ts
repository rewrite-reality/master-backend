import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DevOnlyGuard } from './dev-only.guard';
import { DevAuthService } from './dev-auth.service';

type DevLoginDto = {
	userId?: string;
	email?: string;
	telegramId?: string | number;
};

@Controller('dev/auth')
@UseGuards(DevOnlyGuard)
export class DevAuthController {
	constructor(private readonly devAuth: DevAuthService) { }

	@Post('login')
	async login(@Body() dto: DevLoginDto) {
		// Возвращаем токен + базовую инфу
		return this.devAuth.login(dto);
	}
}
