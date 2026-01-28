import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { AdminUpdateOrderDto } from './dto/admin-update-order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.findAllForAdmin(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateOrderDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.ordersService.updateOrderForAdmin(
      id,
      dto,
      user?.id ?? 'system',
    );
  }
}
