import { IsBoolean, IsString, IsUUID } from 'class-validator';

export class AcceptOrderResponseDto {
  @IsBoolean()
  success: boolean;

  @IsUUID()
  orderId: string;

  @IsString()
  message: string;
}
