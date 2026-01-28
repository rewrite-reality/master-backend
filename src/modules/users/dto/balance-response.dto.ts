import { Expose, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class PayoutSummaryDto {
  @Expose()
  @IsUUID()
  id: string;

  @Expose()
  @IsUUID()
  orderId: string;

  @Expose()
  @IsNumber()
  amount: number;

  @Expose()
  @IsInt()
  percent: number;

  @Expose()
  @IsDate()
  createdAt: Date;
}

export class BalanceResponseDto {
  @Expose()
  @IsNumber()
  balance: number;

  @Expose()
  @IsInt()
  payoutPercent: number;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => PayoutSummaryDto)
  payouts: PayoutSummaryDto[];
}
