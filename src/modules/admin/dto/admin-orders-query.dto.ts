import { Type } from 'class-transformer';
import {
	IsDate,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class AdminOrdersQueryDto {
	@IsOptional()
	@IsEnum(OrderStatus)
	status?: OrderStatus;

	@IsOptional()
	@IsUUID()
	masterId?: string;

	@IsOptional()
	@IsUUID()
	districtId?: string;

	@IsOptional()
	@IsString()
	search?: string;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	fromDate?: Date;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	toDate?: Date;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(200)
	@Type(() => Number)
	limit = 100;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Type(() => Number)
	offset = 0;
}
