import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerificationService } from './verification.service';
import { ReviewMasterDto } from './dto/review-master.dto';
import type { Express } from 'express';

@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MASTER)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.verificationService.uploadDocument(userId, file);
  }

  @Post('submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MASTER)
  async submit(@CurrentUser('id') userId: string) {
    return this.verificationService.submitVerification(userId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MASTER)
  async status(@CurrentUser('id') userId: string) {
    return this.verificationService.getStatus(userId);
  }

  @Patch('review/:masterId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async review(
    @Param('masterId', new ParseUUIDPipe()) masterId: string,
    @Body() dto: ReviewMasterDto,
  ) {
    return this.verificationService.review(
      masterId,
      dto.status,
      dto.rejectionReason,
    );
  }
}
