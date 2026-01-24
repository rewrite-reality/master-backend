import { Type } from 'class-transformer';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	IsUUID,
	Max,
	Min,
} from 'class-validator';
import { PayoutType } from '@prisma/client';

export class AdminManualPayoutDto {
	@IsUUID()
	@IsNotEmpty()
	orderId: string;

	@IsNumber()
	@IsPositive()
	@Type(() => Number)
	amount: number;

	@IsOptional()
	@IsEnum(PayoutType)
	type?: PayoutType;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	@Type(() => Number)
	percent?: number;

	@IsOptional()
	@IsString()
	note?: string;

	@IsOptional()
	@IsIn(['CREDIT', 'DEBIT'])
	direction?: 'CREDIT' | 'DEBIT';
}
