import { Controller, Get, Post, Put, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { BalanceResponseDto } from './dto/balance-response.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(private readonly usersService: UsersService) { }

	@Get('me')
	@HttpCode(HttpStatus.OK)
	async getMe(@CurrentUser() user: User) {
		return this.usersService.getMe(user.id);
	}

	@Get('balance')
	@HttpCode(HttpStatus.OK)
	async getBalance(@CurrentUser() user: User): Promise<BalanceResponseDto> {
		return this.usersService.getBalance(user.id);
	}

	@Post('profile')
	@HttpCode(HttpStatus.CREATED)
	async createProfile(@CurrentUser() user: User, @Body() createProfileDto: CreateProfileDto) {
		return this.usersService.createProfile(user.id, createProfileDto);
	}

	@Put('profile')
	@HttpCode(HttpStatus.OK)
	async updateProfile(@CurrentUser() user: User, @Body() updateProfileDto: UpdateProfileDto) {
		return this.usersService.updateProfile(user.id, updateProfileDto);
	}
}
