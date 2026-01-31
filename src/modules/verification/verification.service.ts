import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MasterProfile,
  Prisma,
  VerificationStatus,
  MasterStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { S3Service } from '../integrations/s3/s3.service';
import { Express } from 'express';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  private async getMasterProfileByUserId(userId: string) {
    const master = await this.prisma.masterProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        verificationStatus: true,
        rejectionReason: true,
        status: true,
        documents: true,
      },
    });

    if (!master) {
      throw new NotFoundException('Профиль мастера не найден');
    }

    return master;
  }

  private async getMasterProfileById(masterId: string) {
    const master = await this.prisma.masterProfile.findUnique({
      where: { id: masterId },
      select: {
        id: true,
        verificationStatus: true,
        rejectionReason: true,
        status: true,
        documents: true,
      },
    });

    if (!master) {
      throw new NotFoundException('Мастер не найден');
    }

    return master;
  }

  private extractDocuments(documents: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(documents)) {
      return [];
    }
    return documents.filter((item): item is string => typeof item === 'string');
  }

  private async deleteVerificationDocumentsFromS3(
    masterId: string,
    documents: string[],
  ) {
    if (documents.length === 0) {
      return;
    }

    try {
      await this.s3Service.deleteFilesByUrls(documents);
    } catch (error) {
      this.logger.warn(
        `Failed to delete verification documents from S3 for master ${masterId}`,
      );
    }
  }

  async uploadDocument(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл обязателен');
    }

    const master = await this.getMasterProfileByUserId(userId);

    // Запрещаем загрузку, если мастер уже верифицирован (чтобы не подменил доки после апрува)
    if (master.verificationStatus === VerificationStatus.VERIFIED) {
      throw new ConflictException(
        'Документы уже проверены, изменение запрещено',
      );
    }

    const documents = this.extractDocuments(master.documents);

    if (
      master.verificationStatus === VerificationStatus.REJECTED &&
      documents.length > 0
    ) {
      await this.deleteVerificationDocumentsFromS3(master.id, documents);
      documents.length = 0;
    }

    const url = await this.s3Service.uploadFile(
      file,
      `verification/${master.id}`,
    );
    documents.push(url);

    const nextStatus =
      master.verificationStatus === VerificationStatus.REJECTED
        ? VerificationStatus.NONE
        : master.verificationStatus;

    await this.prisma.masterProfile.update({
      where: { id: master.id },
      data: {
        documents,
        verificationStatus: nextStatus,
        rejectionReason:
          master.verificationStatus === VerificationStatus.REJECTED
            ? null
            : master.rejectionReason,
      },
    });

    return {
      masterId: master.id,
      url,
      documentsCount: documents.length,
      verificationStatus: nextStatus,
    };
  }

  async submitVerification(userId: string) {
    const master = await this.getMasterProfileByUserId(userId);
    const documents = this.extractDocuments(master.documents);

    if (documents.length < 2) {
      throw new BadRequestException(
        'Нужно минимум 2 файла для отправки на проверку',
      );
    }

    if (master.verificationStatus === VerificationStatus.VERIFIED) {
      throw new ConflictException('Профиль уже верифицирован');
    }

    if (master.verificationStatus === VerificationStatus.PENDING) {
      throw new ConflictException('Заявка уже находится на рассмотрении');
    }

    const updated = await this.prisma.masterProfile.update({
      where: { id: master.id },
      data: {
        verificationStatus: VerificationStatus.PENDING,
        rejectionReason: null,
      },
      select: {
        id: true,
        verificationStatus: true,
        rejectionReason: true,
      },
    });

    return updated;
  }

  async getStatus(userId: string) {
    const master = await this.getMasterProfileByUserId(userId);
    return {
      verificationStatus: master.verificationStatus,
      rejectionReason: master.rejectionReason,
      documentsCount: this.extractDocuments(master.documents).length,
    };
  }

  /**
   * Метод проверки менеджером.
   * Автоматически активирует мастера (MasterStatus.ACTIVE), если верификация успешна.
   */
  async review(
    masterId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ) {
    const master = await this.getMasterProfileById(masterId);
    const documents = this.extractDocuments(master.documents);

    // Валидация входных данных
    if (
      status === VerificationStatus.PENDING ||
      status === VerificationStatus.NONE
    ) {
      throw new BadRequestException(
        'Менеджер может установить только VERIFIED или REJECTED',
      );
    }

    if (status === VerificationStatus.REJECTED && !rejectionReason) {
      throw new BadRequestException(
        'При отказе (REJECTED) обязательно укажите причину',
      );
    }

    // Логика переключения глобального статуса (MasterStatus)
    let newMasterStatus: MasterStatus | undefined = undefined;

    if (status === VerificationStatus.VERIFIED) {
      // Если одобрили доки -> Активируем мастера полностью
      // (Но только если он не был забанен вручную за жесткие нарушения)
      if (master.status !== MasterStatus.BLOCKED) {
        newMasterStatus = MasterStatus.ACTIVE;
      }
    } else if (status === VerificationStatus.REJECTED) {
      // Если отклонили -> Возвращаем в PENDING (не даем работать), но не баним навечно
      if (master.status !== MasterStatus.BLOCKED) {
        newMasterStatus = MasterStatus.PENDING;
      }
    }

    const data: Prisma.MasterProfileUpdateInput = {
      verificationStatus: status,
      rejectionReason:
        status === VerificationStatus.REJECTED
          ? rejectionReason?.trim() || null
          : null,
      ...(status === VerificationStatus.REJECTED && { documents: [] }),
      // Применяем изменение статуса, только если оно вычислено
      ...(newMasterStatus && { status: newMasterStatus }),
    };

    if (status === VerificationStatus.REJECTED && documents.length > 0) {
      try {
        await this.s3Service.deleteFilesByUrls(documents);
      } catch (error) {
        this.logger.warn(
          `Failed to delete verification documents from S3 for master ${master.id}`,
        );
      }
    }

    const updated = await this.prisma.masterProfile.update({
      where: { id: master.id },
      data,
      select: {
        id: true,
        verificationStatus: true,
        rejectionReason: true,
        status: true, // Возвращаем, чтобы менеджер видел результат
      },
    });

    return updated;
  }
}
