import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/database/prisma.service';

type DevLoginDto = {
  userId?: string;
  email?: string;
  telegramId?: string | number; // ищем пользователя по telegramId (user.telegramId)
  tgId?: string | number; // OPTIONAL: если у найденного юзера telegramId пустой, можно задать вручную
};

@Injectable()
export class DevAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: DevLoginDto) {
    if (!dto.userId && !dto.email && !dto.telegramId) {
      throw new BadRequestException('Provide userId OR email OR telegramId');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        ...(dto.userId ? { id: dto.userId } : {}),
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.telegramId ? { telegramId: BigInt(dto.telegramId) } : {}),
      },
      include: { masterProfile: true },
    });

    if (!user) throw new NotFoundException('User not found');

    // JwtStrategy требует: sub, role, tgId
    const resolvedTgId =
      user.telegramId?.toString?.() ??
      (dto.tgId !== undefined && dto.tgId !== null ? String(dto.tgId) : null);

    if (!resolvedTgId) {
      throw new BadRequestException(
        'User has no telegramId, but JwtStrategy requires tgId. ' +
          'Login with telegramId of a master user or pass tgId explicitly.',
      );
    }

    const payload = {
      sub: user.id,
      role: user.role,
      tgId: resolvedTgId,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        telegramId: user.telegramId?.toString?.() ?? null,
        masterId: user.masterProfile?.id ?? null,
      },
    };
  }
}
