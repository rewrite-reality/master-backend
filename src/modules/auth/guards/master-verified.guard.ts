import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service'; // Убедись в пути импорта

@Injectable()
export class MasterVerifiedGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) { }

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const user = request.user;

		// 1. Базовые проверки из токена (быстро)
		if (!user) throw new UnauthorizedException('User not found');
		if (user.role !== 'MASTER') throw new ForbiddenException('User is not a master');

		// 2. ЧЕСТНАЯ ПРОВЕРКА ЧЕРЕЗ БД (Всегда актуально)
		// Мы берем только статус блокировки и верификации
		const master = await this.prisma.masterProfile.findUnique({
			where: { userId: user.id },
			select: {
				status: true,
				verificationStatus: true,
				isBlockedByDebt: true,
			},
		});

		if (!master) {
			throw new UnauthorizedException('Master profile not found');
		}

		// Логируем, чтобы ты увидел в консоли реальное состояние
		// console.log(`[Guard] Master Check: Blocked=${master.isBlockedByDebt}, Verified=${master.verificationStatus}`);

		if (master.status !== 'ACTIVE') {
			throw new UnauthorizedException('Master profile is not active');
		}

		if (master.verificationStatus !== 'VERIFIED') {
			throw new ForbiddenException('Document verification is required');
		}

		// Самое важное:
		if (master.isBlockedByDebt) {
			throw new ForbiddenException('Debt limit exceeded. Please pay the commission.');
		}

		// Обновляем профиль в реквесте, чтобы контроллер тоже получил свежие данные
		request.user.masterProfile = { ...request.user.masterProfile, ...master };

		return true;
	}
}
