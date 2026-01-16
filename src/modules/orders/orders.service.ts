import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { AcceptOrderResponseDto } from './dto/accept-order-response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderAssignedEvent } from './events/order-assigned.event';
import {
	Order,
	Prisma,
	MasterProfile,
	District,
	Specialty,
	DispatchMode,
	OrderStatus,
	MasterStatus,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { AmoCrmSyncService } from '../integrations/amocrm/amocrm.sync.service';
import { PayoutsService } from '../payouts/payouts.service';

// Join table types based on schema
type MasterDistrictRelation = {
	masterId: string;
	districtId: string;
	assignedAt: Date;
};

type MasterSpecialtyRelation = {
	masterId: string;
	specialtyId: string;
	assignedAt: Date;
};

type MasterProfileWithRelations = MasterProfile & {
	districts: MasterDistrictRelation[];
	specialties: MasterSpecialtyRelation[];
};

type OrderWithRelations = Order & {
	district: District;
	specialty: Specialty | null;
	master: MasterProfile | null;
};

const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
	OrderStatus.ASSIGNED,
	OrderStatus.ARRIVED,
	OrderStatus.IN_PROGRESS,
];

const HISTORY_ORDER_STATUSES: readonly OrderStatus[] = [
	OrderStatus.COMPLETED,
	OrderStatus.CANCELLED,
	OrderStatus.DISPUTE,
];

@Injectable()
export class OrdersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly eventEmitter: EventEmitter2,
		private readonly amocrmSyncService: AmoCrmSyncService,
		private readonly payoutsService: PayoutsService,
	) { }

	private async getMasterProfile(userId: string): Promise<MasterProfileWithRelations> {
		const master = await this.prisma.masterProfile.findFirst({
			where: { userId },
			include: {
				districts: true,
				specialties: true,
			},
		});

		if (!master) {
			throw new ForbiddenException('Master profile not found for current user');
		}

		if (master.status !== MasterStatus.ACTIVE) {
			throw new ForbiddenException('Master account is not active');
		}

		return master;
	}

	private getNextStatus(status: OrderStatus): OrderStatus | null {
		switch (status) {
			case OrderStatus.ASSIGNED:
				return OrderStatus.ARRIVED;
			case OrderStatus.ARRIVED:
				return OrderStatus.IN_PROGRESS;
			case OrderStatus.IN_PROGRESS:
				return OrderStatus.COMPLETED;
			default:
				return null;
		}
	}

	private mapToDto(order: OrderWithRelations, currentMasterId?: string): OrderResponseDto {
		const isAssignedToCurrentMaster =
			!!currentMasterId && !!order.masterId && order.masterId === currentMasterId;

		// Safely convert Decimal to number
		const price = order.price ? new Prisma.Decimal(order.price).toNumber() : null;

		const safeOrder = {
			...order,
			price,
			clientName: isAssignedToCurrentMaster ? order.clientName : null,
			clientPhone: isAssignedToCurrentMaster ? order.clientPhone : null,
			// Ensure excluded fields don't accidentally leak if logic changes
			amoContactId: null,
			amoPipelineId: null,
			amoLeadId: null,
			amoLink: null,
		};

		return plainToInstance(OrderResponseDto, safeOrder, {
			excludeExtraneousValues: true,
		});
	}

	async findAvailableOrders(
		userId: string,
		query: GetOrdersQueryDto,
	): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);

		const where: Prisma.OrderWhereInput = {
			status: query.status || OrderStatus.PENDING,
			dispatchMode: DispatchMode.RACE,
		};

		// Filter by District
		if (query.districtId) {
			where.districtId = query.districtId;
		} else {
			// Use districtId from join table
			const masterDistrictIds = master.districts.map((d) => d.districtId);
			where.districtId = { in: masterDistrictIds };
		}

		// Filter by Specialty
		if (query.specialtyId) {
			where.specialtyId = query.specialtyId;
		} else {
			// Use specialtyId from join table
			const masterSpecialtyIds = master.specialties.map((s) => s.specialtyId);
			where.specialtyId = { in: masterSpecialtyIds };
		}

		// Urgent Only
		if (query.urgentOnly) {
			const twoHoursAhead = new Date(Date.now() + 2 * 60 * 60 * 1000);
			where.scheduledAt = {
				lte: twoHoursAhead,
				not: null,
			};
		}

		// Price Range
		if (query.minPrice !== undefined || query.maxPrice !== undefined) {
			where.price = {};
			if (query.minPrice !== undefined) where.price.gte = query.minPrice;
			if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
		}

		// Search
		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}

		const orders = await this.prisma.order.findMany({
			where,
			include: {
				district: true,
				specialty: true,
				master: true,
			},
			orderBy: [
				{ scheduledAt: 'asc' },
				{ createdAt: 'desc' },
			],
			take: query.limit,
			skip: query.offset,
		});

		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	async findActiveOrders(
		userId: string,
		query: GetOrdersQueryDto,
	): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);

		const where: Prisma.OrderWhereInput = {
			masterId: master.id,
			status: { in: ACTIVE_ORDER_STATUSES as OrderStatus[] },
		};

		// No district/specialty filter: list only orders already assigned to this master.
		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}

		const orders = await this.prisma.order.findMany({
			where,
			include: {
				district: true,
				specialty: true,
				master: true,
			},
			// Show the most recently touched active orders first
			orderBy: [
				{ updatedAt: 'desc' },
				{ createdAt: 'desc' },
			],
			take: query.limit,
			skip: query.offset,
		});

		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	async findOrderHistory(
		userId: string,
		query: GetOrdersQueryDto,
	): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);

		const where: Prisma.OrderWhereInput = {
			masterId: master.id,
			status: { in: HISTORY_ORDER_STATUSES as OrderStatus[] },
		};

		// No district/specialty filter: history is limited to this master's completed/cancelled work.
		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}

		const orders = await this.prisma.order.findMany({
			where,
			include: {
				district: true,
				specialty: true,
				master: true,
			},
			// Latest updates first to surface recent completions/cancellations
			orderBy: [
				{ updatedAt: 'desc' },
				{ createdAt: 'desc' },
			],
			take: query.limit,
			skip: query.offset,
		});

		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	async findOneById(orderId: string, userId: string): Promise<OrderResponseDto> {
		const master = await this.getMasterProfile(userId);

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			include: {
				district: true,
				specialty: true,
				master: true,
			},
		});

		if (!order) {
			throw new NotFoundException(`Order with ID ${orderId} not found`);
		}

		// Access Checks: join table ID check
		const hasAccessByDistrict = master.districts.some((d) => d.districtId === order.districtId);

		const hasAccessBySpecialty = order.specialtyId
			? master.specialties.some((s) => s.specialtyId === order.specialtyId)
			: true;

		const isAssignedToThisMaster = order.masterId === master.id;

		if (!isAssignedToThisMaster) {
			if (!hasAccessByDistrict || !hasAccessBySpecialty) {
				throw new ForbiddenException('Access denied to this order');
			}

			if (order.status !== OrderStatus.PENDING) {
				throw new ForbiddenException('Order is not available');
			}
		}

		return this.mapToDto(order as OrderWithRelations, master.id);
	}

	async acceptOrder(orderId: string, userId: string): Promise<AcceptOrderResponseDto> {
		const master = await this.getMasterProfile(userId);

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				districtId: true,
				specialtyId: true,
				status: true,
				dispatchMode: true,
				amoLeadId: true,
			},
		});

		if (!order) {
			throw new NotFoundException('Order not found');
		}

		// Access Checks
		const hasAccessByDistrict = master.districts.some((d) => d.districtId === order.districtId);
		const hasAccessBySpecialty = order.specialtyId
			? master.specialties.some((s) => s.specialtyId === order.specialtyId)
			: true;

		if (!hasAccessByDistrict || !hasAccessBySpecialty) {
			throw new ForbiddenException('Access denied: Outside district or specialty mismatch');
		}

		if (order.dispatchMode !== DispatchMode.RACE) {
			throw new ForbiddenException('This order is not available for Race acceptance');
		}

		// Atomic Transaction
		await this.prisma.$transaction(async (tx) => {
			const result = await tx.order.updateMany({
				where: {
					id: orderId,
					status: OrderStatus.PENDING,
					dispatchMode: DispatchMode.RACE,
				},
				data: {
					status: OrderStatus.ASSIGNED,
					masterId: master.id,
					updatedAt: new Date(),
				},
			});

			if (result.count === 0) {
				throw new ConflictException('Order was just accepted by someone else or is no longer PENDING');
			}

			// Updated to match schema: message + meta query
			await tx.orderLog.create({
				data: {
					orderId,
					message: 'Order status changed to ASSIGNED',
					meta: {
						action: 'ASSIGNED',
						performedBy: master.id,
						details: 'Master accepted the order via Race Mode',
						timestamp: new Date().toISOString()
					},
				},
			});

			await this.amocrmSyncService.enqueueLeadMove(tx, {
				orderId,
				amoLeadId: order.amoLeadId ?? undefined,
				orderStatus: OrderStatus.ASSIGNED,
			});
		});

		this.eventEmitter.emit(
			'order.assigned',
			new OrderAssignedEvent(orderId, master.id, new Date()),
		);

		return { success: true, orderId, message: 'Order successfully accepted' };
	}

	async advanceOrderStatus(orderId: string, userId: string): Promise<{ id: string; status: OrderStatus; amoLeadId: string | null; }> {
		const master = await this.getMasterProfile(userId);

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				status: true,
				masterId: true,
				amoLeadId: true,
			},
		});

		if (!order) {
			throw new NotFoundException('Order not found');
		}

		if (order.masterId !== master.id) {
			throw new ForbiddenException('Only the assigned master can advance this order');
		}

		const nextStatus = this.getNextStatus(order.status);
		if (!nextStatus) {
			throw new ConflictException('Order cannot be advanced from its current status');
		}

		await this.prisma.$transaction(async (tx) => {
			const result = await tx.order.updateMany({
				where: {
					id: orderId,
					status: order.status,
					masterId: master.id,
				},
				data: {
					status: nextStatus,
					updatedAt: new Date(),
				},
			});

			if (result.count === 0) {
				throw new ConflictException('Order status changed, please retry');
			}

			await tx.orderLog.create({
				data: {
					orderId,
					message: `Order status advanced to ${nextStatus}`,
					meta: {
						prevStatus: order.status,
						nextStatus,
						byUserId: userId,
					},
				},
			});

			if (nextStatus === OrderStatus.COMPLETED) {
				await this.payoutsService.creditForOrderCompletion(tx, {
					orderId,
					performedByUserId: userId,
				});
			}

			await this.amocrmSyncService.enqueueLeadMove(tx, {
				orderId,
				amoLeadId: order.amoLeadId ?? undefined,
				orderStatus: nextStatus,
			});
		});

		return {
			id: orderId,
			status: nextStatus,
			amoLeadId: order.amoLeadId ?? null,
		};
	}
}
