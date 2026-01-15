import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

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
}
