import { Exclude, Expose, Transform, Type } from 'class-transformer';
import {
	IsBoolean,
	IsDate,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { DispatchMode, OrderStatus, PaymentType } from '@prisma/client';

export class OrderDistrictDto {
	@Expose()
	@IsString()
	id: string;

	@Expose()
	@IsString()
	name: string;
}

export class OrderSpecialtyDto {
	@Expose()
	@IsString()
	id: string;

	@Expose()
	@IsString()
	name: string;
}

@Exclude()
export class OrderResponseDto {
	@Expose()
	@IsUUID()
	id: string;

	@Expose()
	@IsDate()
	createdAt: Date;

	@Expose()
	@IsDate()
	updatedAt: Date;

	@Expose()
	@IsEnum(OrderStatus)
	status: OrderStatus;

	@Expose()
	@IsEnum(DispatchMode)
	dispatchMode: DispatchMode;

	@Expose()
	@IsString()
	districtId: string;

	@Expose()
	@Type(() => OrderDistrictDto)
	@ValidateNested()
	district: OrderDistrictDto;

	@Expose()
	@IsString()
	city: string;

	@Expose()
	@IsString()
	street: string;

	@Expose()
	@IsString()
	house: string;

	@Expose()
	@IsOptional()
	@IsString()
	entrance: string | null;

	@Expose()
	@IsOptional()
	@IsString()
	floor: string | null;

	@Expose()
	@IsOptional()
	@IsString()
	apartment: string | null;

	@Expose()
	@IsOptional()
	@IsString()
	intercom: string | null;

	@Expose()
	@IsOptional()
	@IsString()
	specialtyId: string | null;

	@Expose()
	@IsOptional()
	@Type(() => OrderSpecialtyDto)
	@ValidateNested()
	specialty: OrderSpecialtyDto | null;

	@Expose()
	@IsString()
	title: string;

	@Expose()
	@IsString()
	description: string;

	@Expose()
	@IsOptional()
	@IsNumber()
	@Transform(({ value }) => (value ? Number(value) : null))
	price: number | null;

	@Expose()
	@IsEnum(PaymentType)
	paymentType: PaymentType;

	@Expose()
	@IsOptional()
	@IsString({ each: true })
	proofPhotos: string[];

	@Expose()
	@IsOptional()
	@IsString()
	clientName: string | null;

	@Expose()
	@IsOptional()
	@IsString()
	clientPhone: string | null;

	@Expose()
	@IsOptional()
	@IsDate()
	scheduledAt: Date | null;

	@Expose()
	@IsOptional()
	@IsDate()
	deadlineAt: Date | null;

	@Expose()
	@IsOptional()
	@IsString()
	masterId: string | null;

	// amo fields are excluded by @Exclude() logic as they are not decorated with @Expose()
	// But explicitly to be safe as per prompt:
	// amoLeadId, amoContactId, amoPipelineId, amoLink - NOT EXPOSED
}
