import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MasterStatus } from '@prisma/client';

const ALLOWED_STATUSES: MasterStatus[] = [MasterStatus.ACTIVE, MasterStatus.BLOCKED];

export class AdminUpdateMasterDto {
	@IsOptional()
	@IsIn(ALLOWED_STATUSES)
	status?: MasterStatus;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	payoutPercent?: number;
}
