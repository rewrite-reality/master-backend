import { DispatchMode, PaymentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
	IsDateString,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Matches,
} from 'class-validator';

export class CreateOrderDto {
	@IsString()
	@IsNotEmpty()
	title: string;

	@IsString()
	@IsOptional()
	description?: string;

	@IsString()
	@IsOptional()
	amoLeadId?: string;

	// @IsUUID()
	@IsNotEmpty()
	districtId: string;

	// @IsUUID()
	@IsOptional()
	specialtyId?: string;

	@IsString()
	@IsOptional()
	city?: string;

	@IsString()
	@IsOptional()
	street?: string;

	@IsString()
	@IsOptional()
	house?: string;

	@IsString()
	@IsOptional()
	entrance?: string;

	@IsString()
	@IsOptional()
	floor?: string;

	@IsString()
	@IsOptional()
	apartment?: string;

	@IsString()
	@IsOptional()
	intercom?: string;

	@IsString()
	@IsNotEmpty()
	clientName: string;

	@IsString()
	@Matches(/^\+7\d{10}$/, { message: 'Phone must match +7XXXXXXXXXX format' })
	clientPhone: string;

	@IsNumber()
	@IsPositive()
	@Type(() => Number)
	price: number;

	@IsEnum(PaymentType)
	paymentType: PaymentType;

	@IsDateString()
	@IsOptional()
	scheduledAt?: string;

	@IsEnum(DispatchMode)
	@IsOptional()
	dispatchMode?: DispatchMode = DispatchMode.RACE;
}
