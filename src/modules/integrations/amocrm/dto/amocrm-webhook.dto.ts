import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AmoCustomFieldDto {
  @IsNumber()
  id: number;

  @IsArray()
  values: any[];
}

export class AmoLeadDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmoCustomFieldDto)
  @IsOptional()
  custom_fields?: AmoCustomFieldDto[];
}

export class AmoWebhookDto {
  @IsOptional()
  leads?: {
    add?: AmoLeadDto[];
    status?: AmoLeadDto[];
  };
}
