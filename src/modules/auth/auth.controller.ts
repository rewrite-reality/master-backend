import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
	constructor(private authService: AuthService) { }

	// POST /auth/login
	// Body: { "initData": "query_id=...&user={...}&hash=..." }
	@Post('login')
	async login(@Body('initData') initData: string) {
		return this.authService.login(initData);
	}
}
