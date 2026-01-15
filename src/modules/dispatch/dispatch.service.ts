import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderCreatedEvent } from './events/order-created.event';
import { DispatchMode, MasterStatus, Order, OrderStatus } from '@prisma/client';

@Injectable()
export class DispatchService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly eventEmitter: EventEmitter2,
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

		console.log(`[DispatchService] Order created: ${order.id}`);

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

		console.log(`[DispatchService] Found ${masters.length} eligible masters`);

		return masters;
	}
}
