import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDistrictDto {
	@IsString()
	@IsNotEmpty()
	name: string;

	@IsOptional()
	@IsString()
	city?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
