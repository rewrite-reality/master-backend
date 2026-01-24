import { Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderCreatedEvent } from './events/order-created.event';
import { DispatchMode, MasterStatus, Order, OrderStatus } from '@prisma/client';
import { Redis } from 'ioredis'; // 1. Импорт Redis

@Injectable()
export class DispatchService {
	private readonly logger = new Logger(DispatchService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly eventEmitter: EventEmitter2,
		// 2. Внедрение клиента Redis
		@Inject('REDIS_CLIENT') private readonly redis: Redis,
	) { }

	async createOrder(dto: CreateOrderDto) {
		const order = await this.prisma.order.create({
			data: {
				amoLeadId: dto.amoLeadId ?? null,
				title: dto.title,
				description: dto.description || '',
				district: { connect: { id: dto.districtId } },
				specialty: dto.specialtyId ? { connect: { id: dto.specialtyId } } : undefined,
				city: dto.city || 'Chelyabinsk',
				street: dto.street || '',
				house: dto.house || '',
				entrance: dto.entrance,
				floor: dto.floor,
				apartment: dto.apartment,
				intercom: dto.intercom,
				clientName: dto.clientName,
				clientPhone: dto.clientPhone,
				price: dto.price, // Prisma handles number -> Decimal conversion
				paymentType: dto.paymentType,
				scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
				dispatchMode: dto.dispatchMode ?? DispatchMode.RACE,
				status: OrderStatus.PENDING,
			},
			include: {
				district: true,
				specialty: true,
			},
		});

		this.logger.log(`[DispatchService] Order created: ${order.id}`);

		// 3. 🔥 HOT CACHE WARM-UP 🔥
		// Сразу пишем в Redis статус заказа, чтобы OrdersService.acceptOrder
		// мог проверить его мгновенно, не обращаясь к БД.
		// TTL ставим 1 час (3600), этого достаточно, чтобы заказ разобрали.
		await this.redis.set(`order:status:${order.id}`, OrderStatus.PENDING, 'EX', 3600);

		this.eventEmitter.emit(
			'order.created',
			new OrderCreatedEvent(
				order.id,
				order.districtId,
				order.specialtyId,
				order.createdAt,
			),
		);

		return order;
	}

	// ... findEligibleMasters оставляем как есть, там кэш не нужен (это сложный поиск)
	async findEligibleMasters(orderId: string) {
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
		});

		if (!order) {
			throw new NotFoundException(`Order with ID ${orderId} not found`);
		}

		const masters = await this.prisma.masterProfile.findMany({
			where: {
				status: MasterStatus.ACTIVE,
				districts: {
					some: {
						districtId: order.districtId,
					},
				},
				...(order.specialtyId
					? {
						specialties: {
							some: {
								specialtyId: order.specialtyId,
							},
						},
					}
					: {}),
			},
			include: {
				user: {
					select: {
						id: true,
						telegramId: true,
						telegramUsername: true,
					},
				},
				districts: true,
				specialties: true,
			},
		});

		this.logger.log(`[DispatchService] Found ${masters.length} eligible masters for order ${orderId}`);

		return masters;
	}
}
