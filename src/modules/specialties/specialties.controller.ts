import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpecialtiesService } from './specialties.service';

@ApiTags('Specialties')
@Controller('specialties')
export class SpecialtiesController {
	constructor(private readonly specialtiesService: SpecialtiesService) { }

	@Get()
	findAll() {
		return this.specialtiesService.findAll();
	}
}
