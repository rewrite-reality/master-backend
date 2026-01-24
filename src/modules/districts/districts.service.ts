import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateDistrictDto } from '../admin/dto/create-district.dto';
import { UpdateDistrictDto } from '../admin/dto/update-district.dto';

type DistrictResponse = {
	id: string;
	name: string;
	city: string | null;
};

@Injectable()
export class DistrictsService {
	constructor(private readonly prisma: PrismaService) { }

	async findAll(): Promise<DistrictResponse[]> {
		return this.prisma.district.findMany({
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
	}

	async findAllAdmin() {
		return this.prisma.district.findMany({
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
	}

	async createDistrict(dto: CreateDistrictDto) {
		const name = dto.name.trim();
		const city = dto.city?.trim() || 'Chelyabinsk';

		try {
			return await this.prisma.district.create({
				data: {
					name,
					city,
					isActive: dto.isActive ?? true,
				},
			});
		} catch (error: any) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('District with this name already exists in the city');
			}
			throw error;
		}
	}

	async updateDistrict(id: string, dto: UpdateDistrictDto) {
		const existing = await this.prisma.district.findUnique({ where: { id } });

		if (!existing) {
			throw new NotFoundException('District not found');
		}

		try {
			return await this.prisma.district.update({
				where: { id },
				data: {
					...(dto.name ? { name: dto.name.trim() } : {}),
					...(dto.city ? { city: dto.city.trim() } : {}),
					...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
				},
			});
		} catch (error: any) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('District with this name already exists in the city');
			}
			throw error;
		}
	}

	async softDeleteDistrict(id: string) {
		const existing = await this.prisma.district.findUnique({ where: { id } });

		if (!existing) {
			throw new NotFoundException('District not found');
		}

		return this.prisma.district.update({
			where: { id },
			data: { isActive: false },
		});
	}
}
