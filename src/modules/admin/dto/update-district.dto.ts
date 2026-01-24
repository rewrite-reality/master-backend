import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDistrictDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	city?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
