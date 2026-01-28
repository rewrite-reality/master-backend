import { Type } from 'class-transformer';
import { IsNumber, IsPositive } from 'class-validator';

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsPositive()
  amount: number;
}
