import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PayoutsService } from '../payouts/payouts.service';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminMastersQueryDto } from './dto/admin-masters-query.dto';
import { AdminUpdateMasterDto } from './dto/admin-update-master.dto';
import { AdminManualPayoutDto } from './dto/admin-manual-payout.dto';

@Controller('admin/masters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminMastersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly payoutsService: PayoutsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@Query() query: AdminMastersQueryDto) {
    return this.usersService.findMastersForAdmin(query);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.usersService.getMasterDetailForAdmin(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: AdminUpdateMasterDto) {
    return this.usersService.updateMasterForAdmin(id, dto);
  }

  @Post(':id/payout')
  async manualPayout(
    @Param('id') masterId: string,
    @Body() dto: AdminManualPayoutDto,
    @CurrentUser() user: { id: string },
  ) {
    const performedByUserId = user?.id ?? 'system';

    return this.prisma.$transaction((tx) =>
      this.payoutsService.createManualAdjustment(tx, {
        masterId,
        orderId: dto.orderId,
        amount: dto.amount,
        type: dto.type,
        percentOverride: dto.percent,
        note: dto.note,
        direction: dto.direction ?? 'CREDIT',
        performedByUserId,
      }),
    );
  }
}
