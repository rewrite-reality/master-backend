import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AdminVerificationQueryDto } from './dto/admin-verification-query.dto';

type MasterWithVerification = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  phone: string;
  status: string;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  documents: string[];
  user: {
    id: string;
    email: string | null;
    telegramUsername: string | null;
  };
};

@Injectable()
export class AdminVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private extractDocuments(documents: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(documents)) {
      return [];
    }
    return documents.filter((v): v is string => typeof v === 'string');
  }

  async list(query: AdminVerificationQueryDto) {
    const where: Prisma.MasterProfileWhereInput = {};

    if (query.status) {
      where.verificationStatus = query.status;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.masterProfile.findMany({
        where,
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          patronymic: true,
        phone: true,
        status: true,
        verificationStatus: true,
        rejectionReason: true,
        documents: true,
        user: {
          select: {
            id: true,
            email: true,
            telegramUsername: true,
            },
          },
        },
        orderBy: [
          { verificationStatus: 'asc' },
          { id: 'desc' },
          { lastName: 'asc' },
        ],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.masterProfile.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        documents: this.extractDocuments(item.documents),
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async detail(masterId: string): Promise<MasterWithVerification> {
    const master = await this.prisma.masterProfile.findUnique({
      where: { id: masterId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            telegramUsername: true,
          },
        },
      },
    });

    if (!master) {
      throw new NotFoundException(`Master ${masterId} not found`);
    }

    const normalized: MasterWithVerification = {
      id: master.id,
      userId: master.userId,
      firstName: master.firstName,
      lastName: master.lastName,
      patronymic: master.patronymic,
      phone: master.phone,
      status: master.status,
      verificationStatus: master.verificationStatus,
      rejectionReason: master.rejectionReason,
      documents: this.extractDocuments(master.documents),
      user: master.user,
    };

    return normalized;
  }
}
