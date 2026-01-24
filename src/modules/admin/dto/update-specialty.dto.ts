import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSpecialtyDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	code?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
