import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SpecialtiesService } from '../specialties/specialties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';

@Controller('admin/specialties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSpecialtiesController {
	constructor(private readonly specialtiesService: SpecialtiesService) { }

	@Get()
	async list() {
		return this.specialtiesService.findAllAdmin();
	}

	@Post()
	async create(@Body() dto: CreateSpecialtyDto) {
		return this.specialtiesService.createSpecialty(dto);
	}

	@Patch(':id')
	async update(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
		return this.specialtiesService.updateSpecialty(id, dto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string) {
		return this.specialtiesService.softDeleteSpecialty(id);
	}
}
