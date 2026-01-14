import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { MasterVerifiedGuard } from '../guards/master-verified.guard';

export function AuthMaster() {
	return applyDecorators(
		UseGuards(JwtAuthGuard, MasterVerifiedGuard),
	);
}

