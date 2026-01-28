import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  Length,
  Matches,
  IsUUID,
} from 'class-validator';

/**
 * DTO для создания профиля мастера (первичное заполнение)
 */
export class CreateProfileDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  firstName: string; // Имя

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  lastName: string; // Фамилия

  @IsString()
  @Length(2, 50)
  patronymic?: string; // Отчество (опционально)

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone format' })
  phone: string; // Телефон в формате +79001234567

  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least 1 district' })
  @IsString({ each: true })
  // @IsUUID('4', { each: true })
  districtIds: string[]; // Массив UUID районов

  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least 1 specialty' })
  @IsString({ each: true })
  // @IsUUID('4', { each: true })
  specialtyIds: string[]; // Массив UUID специальностей
}
