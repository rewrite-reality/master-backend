import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderResponseDto } from '../orders/dto/order-response.dto';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';

@Controller('orders')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.dispatchService.createOrder(createOrderDto);

    // Map to Response DTO (handle Decimal -> Number)
    const price = order.price
      ? new Prisma.Decimal(order.price).toNumber()
      : null;

    const response = {
      ...order,
      price,
    };

    return plainToInstance(OrderResponseDto, response, {
      excludeExtraneousValues: true,
    });
  }
}
