import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { MasterStatus } from '@prisma/client';

export class AdminMastersQueryDto {
	@IsOptional()
	@IsEnum(MasterStatus)
	status?: MasterStatus;

	@IsOptional()
	@IsUUID()
	districtId?: string;

	@IsOptional()
	@IsString()
	search?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	@Type(() => Number)
	limit = 50;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Type(() => Number)
	offset = 0;
}
