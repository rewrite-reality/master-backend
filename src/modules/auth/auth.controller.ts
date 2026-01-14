import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto'; // +
/**
 * Контроллер авторизации
 * Отвечает за вход через Telegram Mini App
 */
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) { }

	@Post('login')
	@HttpCode(HttpStatus.OK)
	async login(@Body() loginDto: LoginDto) { // Используем DTO
		return this.authService.login(loginDto.initData);
	}
}
