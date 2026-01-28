import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Redis } from 'ioredis'; // Импортируем типы из ioredis
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSpecialtyDto } from '../admin/dto/create-specialty.dto';
import { UpdateSpecialtyDto } from '../admin/dto/update-specialty.dto';

type SpecialtyResponse = {
  id: string;
  name: string;
  code: string;
};

@Injectable()
export class SpecialtiesService {
  private readonly logger = new Logger(SpecialtiesService.name);
  private readonly CACHE_TTL = 3600; // 1 час в секундах
  private readonly CACHE_KEY_PUBLIC = 'specialties:public';
  private readonly CACHE_KEY_ADMIN = 'specialties:admin';

  constructor(
    private readonly prisma: PrismaService,
    // Внедряем твой уже существующий клиент
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Получение списка для клиентов (с кэшированием)
   * Оптимизация: 0 запросов к БД при прогретом кэше.
   */
  async findAll(): Promise<SpecialtyResponse[]> {
    // 1. Попытка прочитать из Redis (очень быстро, < 1ms)
    const cached = await this.redis.get(this.CACHE_KEY_PUBLIC);

    if (cached) {
      // Десериализация JSON быстрее, чем запрос к БД
      return JSON.parse(cached);
    }

    // 2. Если кэша нет - идем в БД
    const data = await this.prisma.specialty.findMany({
      where: { isActive: true }, // Только активные!
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    // 3. Сохраняем в Redis с TTL (EX)
    if (data.length > 0) {
      await this.redis.set(
        this.CACHE_KEY_PUBLIC,
        JSON.stringify(data),
        'EX',
        this.CACHE_TTL,
      );
    }

    return data;
  }

  // Аналогично для админки, но можно TTL поменьше, если админы часто правят
  async findAllAdmin() {
    const cached = await this.redis.get(this.CACHE_KEY_ADMIN);
    if (cached) return JSON.parse(cached);

    const data = await this.prisma.specialty.findMany({
      select: { id: true, name: true, code: true, isActive: true },
      orderBy: { name: 'asc' },
    });

    await this.redis.set(this.CACHE_KEY_ADMIN, JSON.stringify(data), 'EX', 600); // 10 мин
    return data;
  }

  async createSpecialty(dto: CreateSpecialtyDto) {
    try {
      const result = await this.prisma.specialty.create({
        data: {
          name: dto.name.trim(),
          code: dto.code.trim(),
          isActive: dto.isActive ?? true,
        },
      });

      // Очистка кэша, чтобы пользователи увидели новое
      await this.invalidateCache();

      return result;
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateSpecialty(id: string, dto: UpdateSpecialtyDto) {
    try {
      // Оптимизация: убран лишний findUnique перед update
      const result = await this.prisma.specialty.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.code ? { code: dto.code.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.invalidateCache();
      return result;
    } catch (error) {
      this.handlePrismaError(error, id);
    }
  }

  async softDeleteSpecialty(id: string) {
    try {
      const result = await this.prisma.specialty.update({
        where: { id },
        data: { isActive: false },
      });

      await this.invalidateCache();
      return result;
    } catch (error) {
      this.handlePrismaError(error, id);
    }
  }

  // Сброс кэша при любых изменениях
  private async invalidateCache() {
    await Promise.all([
      this.redis.del(this.CACHE_KEY_PUBLIC),
      this.redis.del(this.CACHE_KEY_ADMIN),
    ]);
    this.logger.log('Specialties cache invalidated');
  }

  private handlePrismaError(error: any, id?: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Specialty code must be unique');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(
          `Specialty with ID ${id || 'unknown'} not found`,
        );
      }
    }
    throw error;
  }
}
