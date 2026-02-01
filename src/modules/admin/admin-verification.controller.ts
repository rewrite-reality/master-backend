import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminVerificationService } from './admin-verification.service';
import { AdminVerificationQueryDto } from './dto/admin-verification-query.dto';

@Controller('admin/verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminVerificationController {
  constructor(
    private readonly adminVerificationService: AdminVerificationService,
  ) {}

  @Get()
  async list(@Query() query: AdminVerificationQueryDto) {
    return this.adminVerificationService.list(query);
  }

  @Get(':masterId')
  async detail(@Param('masterId', new ParseUUIDPipe()) masterId: string) {
    return this.adminVerificationService.detail(masterId);
  }
}
