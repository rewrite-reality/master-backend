import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	UseGuards,
	HttpCode,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { AcceptOrderResponseDto } from './dto/accept-order-response.dto';
import { AdvanceOrderResponseDto } from './dto/advance-order-response.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
	constructor(private readonly ordersService: OrdersService) { }

	@Get()
	async findAll(
		@CurrentUser() user: { id: string },
		@Query() query: GetOrdersQueryDto,
	): Promise<OrderResponseDto[]> {
		console.log('à?"? [OrdersController] User from @CurrentUser():', user?.id);
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
		console.log('à?"? [OrdersController] User from @CurrentUser():', user?.id);
		return this.ordersService.findOneById(id, user.id);
	}

	@Post(':id/accept')
	@HttpCode(200)
	async acceptOrder(
		@CurrentUser() user: { id: string },
		@Param('id') id: string,
		// @Param('id', ParseUUIDPipe) id: string,
	): Promise<AcceptOrderResponseDto> {
		console.log('à?"? [OrdersController] User from @CurrentUser():', user?.id);
		return this.ordersService.acceptOrder(id, user.id);
	}

	@Post(':id/advance')
	@HttpCode(200)
	async advanceOrder(
		@CurrentUser() user: { id: string },
		@Param('id') id: string,
	): Promise<AdvanceOrderResponseDto> {
		console.log('à?"? [OrdersController] User from @CurrentUser():', user?.id);
		return this.ordersService.advanceOrderStatus(id, user.id);
	}
}
