import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

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
}
