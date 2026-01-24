import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';

/**
 * Контроллер авторизации для Telegram Mini App и веб-админки.
 */
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) { }

	@Post('login')
	@HttpCode(HttpStatus.OK)
	async login(@Body() loginDto: LoginDto) {
		return this.authService.login(loginDto.initData);
	}

	@Post('admin/login')
	@HttpCode(HttpStatus.OK)
	async loginAdmin(@Body() adminLoginDto: AdminLoginDto) {
		return this.authService.loginAdmin(adminLoginDto.email, adminLoginDto.password);
	}
}
