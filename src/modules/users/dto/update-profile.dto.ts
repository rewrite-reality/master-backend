import { PartialType } from '@nestjs/mapped-types';
import { CreateProfileDto } from './create-profile.dto';

/**
 * DTO для обновления профиля (все поля опциональны)
 */
export class UpdateProfileDto extends PartialType(CreateProfileDto) { }
