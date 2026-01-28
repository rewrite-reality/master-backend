import { VerificationStatus } from '@prisma/client';
import { IsEmpty, IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class ReviewMasterDto {
	@IsIn([VerificationStatus.VERIFIED, VerificationStatus.REJECTED], { message: 'status должен быть VERIFIED или REJECTED' })
	status: VerificationStatus;

	@ValidateIf((dto) => dto.status === VerificationStatus.REJECTED)
	@IsString()
	@IsNotEmpty()
	@ValidateIf((dto) => dto.status !== VerificationStatus.REJECTED)
	@IsEmpty({ message: 'rejectionReason запрещено для статуса VERIFIED' })
	rejectionReason?: string;
}
