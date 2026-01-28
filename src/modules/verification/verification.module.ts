import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { S3Module } from '../integrations/s3/s3.module';

@Module({
  imports: [S3Module],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
