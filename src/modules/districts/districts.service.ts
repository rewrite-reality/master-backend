import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { Redis } from 'ioredis'; // Используем типы ioredis
import { CreateDistrictDto } from '../admin/dto/create-district.dto';
import { UpdateDistrictDto } from '../admin/dto/update-district.dto';

type DistrictResponse = {
	id: string;
	name: string;
	city: string | null;
};

@Injectable()
export class DistrictsService {
	private readonly logger = new Logger(DistrictsService.name);

	// Константы для ключей и времени жизни
	private readonly CACHE_TTL = 3600 * 24; // 24 часа! Районы почти вечные.
	private readonly CACHE_KEY_PUBLIC = 'districts:public';
	private readonly CACHE_KEY_ADMIN = 'districts:admin';

	constructor(
		private readonly prisma: PrismaService,
		@Inject('REDIS_CLIENT') private readonly redis: Redis, // Твой редис
	) { }

	/**
	 * Публичный список районов (для мастеров/клиентов)
	 * Оптимизация: Отдаем только активные + кэш
	 */
	async findAll(): Promise<DistrictResponse[]> {
		// 1. Читаем кэш
		const cached = await this.redis.get(this.CACHE_KEY_PUBLIC);
		if (cached) {
			return JSON.parse(cached);
		}

		// 2. Если пусто — читаем БД
		const data = await this.prisma.district.findMany({
			where: { isActive: true }, // ВАЖНО: скрываем удаленные от пользователей
			select: {
				id: true,
				name: true,
				city: true,
			},
			orderBy: [
				{ city: 'asc' },
				{ name: 'asc' },
			],
		});

		// 3. Пишем в кэш
		if (data.length > 0) {
			await this.redis.set(
				this.CACHE_KEY_PUBLIC,
				JSON.stringify(data),
				'EX',
				this.CACHE_TTL
			);
		}

		return data;
	}

	/**
	 * Полный список для админки (включая скрытые)
	 */
	async findAllAdmin() {
		const cached = await this.redis.get(this.CACHE_KEY_ADMIN);
		if (cached) return JSON.parse(cached);

		const data = await this.prisma.district.findMany({
			select: {
				id: true,
				name: true,
				city: true,
				isActive: true,
			},
			orderBy: [
				{ city: 'asc' },
				{ name: 'asc' },
			],
		});

		await this.redis.set(this.CACHE_KEY_ADMIN, JSON.stringify(data), 'EX', 600); // 10 мин
		return data;
	}

	async createDistrict(dto: CreateDistrictDto) {
		const name = dto.name.trim();
		const city = dto.city?.trim() || 'Chelyabinsk';

		try {
			const result = await this.prisma.district.create({
				data: {
					name,
					city,
					isActive: dto.isActive ?? true,
				},
			});

			// Сбрасываем кэш, чтобы новый район появился в списке
			await this.invalidateCache();

			return result;
		} catch (error) {
			this.handlePrismaError(error);
		}
	}

	async updateDistrict(id: string, dto: UpdateDistrictDto) {
		try {
			// ОПТИМИЗАЦИЯ: Сразу Update без предварительного поиска
			const result = await this.prisma.district.update({
				where: { id },
				data: {
					...(dto.name ? { name: dto.name.trim() } : {}),
					...(dto.city ? { city: dto.city.trim() } : {}),
					...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
				},
			});

			await this.invalidateCache();
			return result;
		} catch (error) {
			this.handlePrismaError(error, id);
		}
	}

	async softDeleteDistrict(id: string) {
		try {
			const result = await this.prisma.district.update({
				where: { id },
				data: { isActive: false },
			});

			await this.invalidateCache();
			return result;
		} catch (error) {
			this.handlePrismaError(error, id);
		}
	}

	// Единая точка сброса кэша
	private async invalidateCache() {
		await Promise.all([
			this.redis.del(this.CACHE_KEY_PUBLIC),
			this.redis.del(this.CACHE_KEY_ADMIN),
		]);
		this.logger.log('Districts cache invalidated');
	}

	// DRY: Вынес обработку ошибок
	private handlePrismaError(error: any, id?: string): never {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			if (error.code === 'P2002') {
				throw new ConflictException('District with this name already exists in the city');
			}
			if (error.code === 'P2025') {
				throw new NotFoundException(`District with ID ${id || 'unknown'} not found`);
			}
		}
		throw error;
	}
}
