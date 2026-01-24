import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
	constructor(private readonly prisma: PrismaService) { }

	async findAll(): Promise<SpecialtyResponse[]> {
		return this.prisma.specialty.findMany({
			select: {
				id: true,
				name: true,
				code: true,
			},
			orderBy: { name: 'asc' },
		});
	}

	async findAllAdmin() {
		return this.prisma.specialty.findMany({
			select: { id: true, name: true, code: true, isActive: true },
			orderBy: { name: 'asc' },
		});
	}

	async createSpecialty(dto: CreateSpecialtyDto) {
		try {
			return await this.prisma.specialty.create({
				data: {
					name: dto.name.trim(),
					code: dto.code.trim(),
					isActive: dto.isActive ?? true,
				},
			});
		} catch (error: any) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('Specialty code must be unique');
			}
			throw error;
		}
	}

	async updateSpecialty(id: string, dto: UpdateSpecialtyDto) {
		const existing = await this.prisma.specialty.findUnique({ where: { id } });

		if (!existing) {
			throw new NotFoundException('Specialty not found');
		}

		try {
			return await this.prisma.specialty.update({
				where: { id },
				data: {
					...(dto.name ? { name: dto.name.trim() } : {}),
					...(dto.code ? { code: dto.code.trim() } : {}),
					...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
				},
			});
		} catch (error: any) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('Specialty code must be unique');
			}
			throw error;
		}
	}

	async softDeleteSpecialty(id: string) {
		const existing = await this.prisma.specialty.findUnique({ where: { id } });

		if (!existing) {
			throw new NotFoundException('Specialty not found');
		}

		return this.prisma.specialty.update({
			where: { id },
			data: { isActive: false },
		});
	}
}
