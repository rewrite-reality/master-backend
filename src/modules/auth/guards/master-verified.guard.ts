import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { User, MasterProfile } from '@prisma/client';

@Injectable()
export class MasterVerifiedGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest();
		const user = request.user as User & { masterProfile?: MasterProfile };

		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		if (user.role !== 'MASTER') {
			throw new UnauthorizedException('User is not a master');
		}

		if (!user.masterProfile) {
			throw new UnauthorizedException('Master profile not found');
		}

		if (user.masterProfile.status !== 'ACTIVE') {
			throw new UnauthorizedException('Master profile is not active');
		}

		if (user.masterProfile.verificationStatus !== 'VERIFIED') {
			throw new UnauthorizedException('Master profile is not verified');
		}

		if (user.masterProfile.isBlockedByDebt) {
			throw new ForbiddenException('Limit exceeded');
		}

		return true;
	}
}
