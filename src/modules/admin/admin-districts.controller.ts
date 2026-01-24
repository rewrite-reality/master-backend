import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DistrictsService } from '../districts/districts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDistrictDto } from './dto/create-district.dto';
import { UpdateDistrictDto } from './dto/update-district.dto';

@Controller('admin/districts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminDistrictsController {
	constructor(private readonly districtsService: DistrictsService) { }

	@Get()
	async list() {
		return this.districtsService.findAllAdmin();
	}

	@Post()
	async create(@Body() dto: CreateDistrictDto) {
		return this.districtsService.createDistrict(dto);
	}

	@Patch(':id')
	async update(@Param('id') id: string, @Body() dto: UpdateDistrictDto) {
		return this.districtsService.updateDistrict(id, dto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string) {
		return this.districtsService.softDeleteDistrict(id);
	}
}
