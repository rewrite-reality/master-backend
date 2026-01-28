import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { AcceptOrderResponseDto } from './dto/accept-order-response.dto';
import { AdvanceOrderResponseDto } from './dto/advance-order-response.dto';
import { S3Service } from '../integrations/s3/s3.service';
import { Express } from 'express';
import * as multer from 'multer';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly s3Service: S3Service,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: { id: string },
    @Query() query: GetOrdersQueryDto,
  ): Promise<OrderResponseDto[]> {
    console.log('Г ?"? [OrdersController] User from @CurrentUser():', user?.id);
    const scope = query.scope ?? 'available';

    if (scope === 'active') {
      return this.ordersService.findActiveOrders(user.id, query);
    }

    if (scope === 'history') {
      return this.ordersService.findOrderHistory(user.id, query);
    }

    return this.ordersService.findAvailableOrders(user.id, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    // @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    console.log('Г ?"? [OrdersController] User from @CurrentUser():', user?.id);
    return this.ordersService.findOneById(id, user.id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  async acceptOrder(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    // @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AcceptOrderResponseDto> {
    console.log('Г ?"? [OrdersController] User from @CurrentUser():', user?.id);
    return this.ordersService.acceptOrder(id, user.id);
  }

  @Post(':id/advance')
  @HttpCode(200)
  async advanceOrder(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<AdvanceOrderResponseDto> {
    console.log('Г ?"? [OrdersController] User from @CurrentUser():', user?.id);
    return this.ordersService.advanceOrderStatus(id, user.id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('photos', 5, { storage: multer.memoryStorage() }),
  )
  async submitForReview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<OrderResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one photo is required');
    }

    const hasNonImage = files.some(
      (file) => !file.mimetype?.startsWith('image/'),
    );
    if (hasNonImage) {
      throw new BadRequestException('Only image uploads are allowed');
    }

    const photoUrls = await Promise.all(
      files.map((file) => this.s3Service.uploadFile(file, 'order-proofs')),
    );

    return this.ordersService.submitForReview(id, user.id, photoUrls);
  }
}
