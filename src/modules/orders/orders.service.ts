import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { AcceptOrderResponseDto } from './dto/accept-order-response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderAssignedEvent } from './events/order-assigned.event';
import { Redis } from 'ioredis'; // Твой редис
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
import { AdminOrdersQueryDto } from '../admin/dto/admin-orders-query.dto';
import { AdminUpdateOrderDto } from '../admin/dto/admin-update-order.dto';
import { MapService } from '../../core/utils/map.service';

// ... (Type definitions remain the same) ...
type MasterDistrictRelation = { masterId: string; districtId: string; assignedAt: Date };
type MasterSpecialtyRelation = { masterId: string; specialtyId: string; assignedAt: Date };
type MasterProfileWithRelations = MasterProfile & { districts: MasterDistrictRelation[]; specialties: MasterSpecialtyRelation[] };
type OrderWithRelations = Order & { district: District; specialty: Specialty | null; master: MasterProfile | null };

const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.ASSIGNED, OrderStatus.ARRIVED, OrderStatus.IN_PROGRESS, OrderStatus.REVIEW];
const HISTORY_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.DISPUTE];

@Injectable()
export class OrdersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly eventEmitter: EventEmitter2,
		private readonly amocrmSyncService: AmoCrmSyncService,
		private readonly payoutsService: PayoutsService,
		private readonly mapService: MapService,
		@Inject('REDIS_CLIENT') private readonly redis: Redis, // Внедряем Redis
	) { }

	// ... (Helper methods getMasterProfile, getNextStatus, mapToDto remain the same) ...
	private async getMasterProfile(userId: string): Promise<MasterProfileWithRelations> {
		const master = await this.prisma.masterProfile.findFirst({
			where: { userId },
			include: { districts: true, specialties: true },
		});
		if (!master) throw new ForbiddenException('Master profile not found for current user');
		if (master.status !== MasterStatus.ACTIVE) throw new ForbiddenException('Master account is not active');
		return master;
	}

	private getNextStatus(status: OrderStatus): OrderStatus | null {
		switch (status) {
			case OrderStatus.ASSIGNED: return OrderStatus.ARRIVED;
			case OrderStatus.ARRIVED: return OrderStatus.IN_PROGRESS;
			case OrderStatus.IN_PROGRESS: return OrderStatus.REVIEW;
			case OrderStatus.REVIEW: return OrderStatus.COMPLETED;
			default: return null;
		}
	}

	private mapToDto(order: OrderWithRelations, currentMasterId?: string): OrderResponseDto {
		// ... same as before
		const isAssignedToCurrentMaster = !!currentMasterId && !!order.masterId && order.masterId === currentMasterId;
		const price = order.price ? new Prisma.Decimal(order.price).toNumber() : null;
		let mapUrl: string | null = null;
		if (order.lat !== null && order.lon !== null && typeof order.lat === 'number' && typeof order.lon === 'number') {
			mapUrl = this.mapService.generateStaticMapUrl(order.lat, order.lon);
		}

		const safeOrder = {
			...order,
			price,
			clientName: isAssignedToCurrentMaster ? order.clientName : null,
			clientPhone: isAssignedToCurrentMaster ? order.clientPhone : null,
			amoContactId: null,
			amoPipelineId: null,
			amoLeadId: null,
			amoLink: null,
			mapUrl,
		};

		return plainToInstance(OrderResponseDto, safeOrder, { excludeExtraneousValues: true });
	}

	// --- OPTIMIZED FIND METHODS ---

	async findAvailableOrders(userId: string, query: GetOrdersQueryDto): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);
		// Оптимизация: берем ID сразу, не таскаем объекты
		const masterDistrictIds = master.districts.map(d => d.districtId);
		const masterSpecialtyIds = master.specialties.map(s => s.specialtyId);

		const where: Prisma.OrderWhereInput = {
			status: query.status || OrderStatus.PENDING,
			dispatchMode: DispatchMode.RACE,
			// Фильтр по районам и специальностям
			districtId: query.districtId ? query.districtId : { in: masterDistrictIds },
			specialtyId: query.specialtyId ? query.specialtyId : { in: masterSpecialtyIds },
		};

		if (query.urgentOnly) {
			where.scheduledAt = { lte: new Date(Date.now() + 2 * 3600000), not: null };
		}

		if (query.minPrice || query.maxPrice) {
			where.price = {};
			if (query.minPrice) where.price.gte = query.minPrice;
			if (query.maxPrice) where.price.lte = query.maxPrice;
		}

		if (query.search) {
			// ... search logic same
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}

		// Здесь кэш опасен, так как лента у всех разная.
		// Просто делаем селект. Индексы на status, districtId, specialtyId обязательны!
		const orders = await this.prisma.order.findMany({
			where,
			include: { district: true, specialty: true, master: true },
			orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
			take: query.limit,
			skip: query.offset,
		});

		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	// ... (findActiveOrders, findOrderHistory, findOneById remain largely same) ...
	// Их можно оставить как есть, там нагрузка персональная (на 1 мастера)

	async findActiveOrders(userId: string, query: GetOrdersQueryDto): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);
		const where: Prisma.OrderWhereInput = {
			masterId: master.id,
			status: { in: ACTIVE_ORDER_STATUSES as OrderStatus[] },
		};
		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}

		const orders = await this.prisma.order.findMany({
			where,
			include: { district: true, specialty: true, master: true },
			orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
			take: query.limit,
			skip: query.offset,
		});
		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	async findOrderHistory(userId: string, query: GetOrdersQueryDto): Promise<OrderResponseDto[]> {
		const master = await this.getMasterProfile(userId);
		const where: Prisma.OrderWhereInput = {
			masterId: master.id,
			status: { in: HISTORY_ORDER_STATUSES as OrderStatus[] },
		};
		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: 'insensitive' } },
				{ description: { contains: query.search, mode: 'insensitive' } },
				{ street: { contains: query.search, mode: 'insensitive' } },
			];
		}
		const orders = await this.prisma.order.findMany({
			where,
			include: { district: true, specialty: true, master: true },
			orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
			take: query.limit,
			skip: query.offset,
		});
		return orders.map((order) => this.mapToDto(order as OrderWithRelations, master.id));
	}

	async findOneById(orderId: string, userId: string): Promise<OrderResponseDto> {
		const master = await this.getMasterProfile(userId);
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			include: { district: true, specialty: true, master: true },
		});

		if (!order) throw new NotFoundException(`Order with ID ${orderId} not found`);

		const hasAccessByDistrict = master.districts.some((d) => d.districtId === order.districtId);
		const hasAccessBySpecialty = order.specialtyId ? master.specialties.some((s) => s.specialtyId === order.specialtyId) : true;
		const isAssignedToThisMaster = order.masterId === master.id;

		if (!isAssignedToThisMaster) {
			if (!hasAccessByDistrict || !hasAccessBySpecialty) throw new ForbiddenException('Access denied to this order');
			if (order.status !== OrderStatus.PENDING) throw new ForbiddenException('Order is not available');
		}
		return this.mapToDto(order as OrderWithRelations, master.id);
	}


	// --- CORE: RACE MODE ACCEPTANCE ---

	async acceptOrder(orderId: string, userId: string): Promise<AcceptOrderResponseDto> {
		const master = await this.getMasterProfile(userId);

		// 1. HOT CACHE CHECK (Redis)
		// Проверяем статус в Redis перед тем как идти в БД.
		// Если статус уже 'ASSIGNED' или 'CANCELLED' - отбой.
		// Ключ: order:status:{id}
		const cachedStatus = await this.redis.get(`order:status:${orderId}`);

		if (cachedStatus && cachedStatus !== OrderStatus.PENDING) {
			// Если в кэше статус не PENDING, значит кто-то уже забрал
			throw new ConflictException('Order was just accepted by someone else (Fast Check)');
		}

		// 2. Обычная проверка БД (на случай если кэша нет или он протух)
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { id: true, districtId: true, specialtyId: true, status: true, dispatchMode: true, amoLeadId: true },
		});

		if (!order) throw new NotFoundException('Order not found');

		// Access Checks (Region/Specialty)
		const hasAccessByDistrict = master.districts.some((d) => d.districtId === order.districtId);
		const hasAccessBySpecialty = order.specialtyId ? master.specialties.some((s) => s.specialtyId === order.specialtyId) : true;

		if (!hasAccessByDistrict || !hasAccessBySpecialty) throw new ForbiddenException('Access denied: Outside district or specialty mismatch');
		if (order.dispatchMode !== DispatchMode.RACE) throw new ForbiddenException('This order is not available for Race acceptance');

		// 3. ATOMIC UPDATE
		await this.prisma.$transaction(async (tx) => {
			const result = await tx.order.updateMany({
				where: {
					id: orderId,
					status: OrderStatus.PENDING, // Optimistic Lock
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

			// Обновляем Redis статус сразу!
			await this.redis.set(`order:status:${orderId}`, OrderStatus.ASSIGNED, 'EX', 3600);

			// Логи
			await tx.orderLog.create({
				data: {
					orderId,
					message: 'Order status changed to ASSIGNED',
					meta: { action: 'ASSIGNED', performedBy: master.id, details: 'Race Mode Win' },
				},
			});

			// AmoCRM Sync
			await this.amocrmSyncService.enqueueLeadMove(tx, {
				orderId,
				amoLeadId: order.amoLeadId ?? undefined,
				orderStatus: OrderStatus.ASSIGNED,
			});
		});

		// 4. Emit Event
		this.eventEmitter.emit('order.assigned', new OrderAssignedEvent(orderId, master.id, new Date()));

		return { success: true, orderId, message: 'Order successfully accepted' };
	}

	async advanceOrderStatus(orderId: string, userId: string): Promise<{ id: string; status: OrderStatus; amoLeadId: string | null; }> {
		const master = await this.getMasterProfile(userId);
		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			select: { id: true, status: true, masterId: true, amoLeadId: true },
		});

		if (!order) throw new NotFoundException('Order not found');
		if (order.masterId !== master.id) throw new ForbiddenException('Only the assigned master can advance this order');
		if (order.status === OrderStatus.REVIEW) {
			throw new ForbiddenException('Waiting for manager approval');
		}

		const nextStatus = this.getNextStatus(order.status);
		if (!nextStatus) throw new ConflictException('Order cannot be advanced from its current status');

		await this.prisma.$transaction(async (tx) => {
			const result = await tx.order.updateMany({
				where: { id: orderId, status: order.status, masterId: master.id },
				data: { status: nextStatus, updatedAt: new Date() },
			});

			if (result.count === 0) throw new ConflictException('Order status changed, please retry');

			// Update Cache
			await this.redis.set(`order:status:${orderId}`, nextStatus, 'EX', 3600);

			// Logs & Sync
			await tx.orderLog.create({
				data: {
					orderId,
					message: `Order status advanced to ${nextStatus}`,
					meta: { prevStatus: order.status, nextStatus, byUserId: userId },
				}
			});

			if (nextStatus === OrderStatus.COMPLETED) {
				await this.payoutsService.creditForOrderCompletion(tx, { orderId, performedByUserId: userId });
			}

			await this.amocrmSyncService.enqueueLeadMove(tx, {
				orderId,
				amoLeadId: order.amoLeadId ?? undefined,
				orderStatus: nextStatus,
			});
		});

		return { id: orderId, status: nextStatus, amoLeadId: order.amoLeadId ?? null };
	}

	async submitForReview(orderId: string, userId: string, photoUrls: string[]): Promise<OrderResponseDto> {
		const master = await this.getMasterProfile(userId);

		if (!photoUrls || photoUrls.length === 0) {
			throw new BadRequestException('At least one proof photo is required');
		}

		const order = await this.prisma.order.findUnique({
			where: { id: orderId },
			include: { district: true, specialty: true, master: true },
		});

		if (!order) {
			throw new NotFoundException('Order not found');
		}

		if (order.masterId !== master.id) {
			throw new ForbiddenException('Only the assigned master can submit review for this order');
		}

		if (order.status !== OrderStatus.IN_PROGRESS) {
			throw new ConflictException('Order must be in progress before submitting for review');
		}

		const updatedOrder = await this.prisma.$transaction(async (tx) => {
			const updated = await tx.order.update({
				where: { id: orderId },
				data: {
					status: OrderStatus.REVIEW,
					proofPhotos: photoUrls,
					updatedAt: new Date(),
				},
				include: { district: true, specialty: true, master: true },
			});

			await tx.orderLog.create({
				data: {
					orderId,
					message: 'Master submitted photos for review',
					meta: { proofPhotosCount: photoUrls.length },
				},
			});

			await this.amocrmSyncService.enqueueLeadMove(tx, {
				orderId,
				amoLeadId: order.amoLeadId ?? undefined,
				orderStatus: OrderStatus.REVIEW,
			});

			// this.eventEmitter.emit('order.review_submitted', { orderId, masterId: master.id });

			return updated;
		});

		await this.redis.set(`order:status:${orderId}`, OrderStatus.REVIEW, 'EX', 3600);

		return this.mapToDto(updatedOrder as OrderWithRelations, master.id);
	}

	// --- ADMIN METHODS (можно оставить без изменений, там нагрузки нет) ---
	// ... (findAllForAdmin, findOneForAdmin, updateOrderForAdmin from your code) ...
	async findAllForAdmin(query: AdminOrdersQueryDto) {
		const where: Prisma.OrderWhereInput = {};

		if (query.status) {
			where.status = query.status;
		}

		if (query.masterId) {
			where.masterId = query.masterId;
		}

		if (query.districtId) {
			where.districtId = query.districtId;
		}

		if (query.fromDate || query.toDate) {
			const createdAtFilter: Prisma.DateTimeFilter = {};
			if (query.fromDate) {
				createdAtFilter.gte = query.fromDate;
			}
			if (query.toDate) {
				createdAtFilter.lte = query.toDate;
			}
			where.createdAt = createdAtFilter;
		}

		if (query.search) {
			const normalized = query.search.trim();
			where.OR = [
				{ title: { contains: normalized, mode: 'insensitive' } },
				{ description: { contains: normalized, mode: 'insensitive' } },
				{ clientName: { contains: normalized, mode: 'insensitive' } },
				{ clientPhone: { contains: normalized, mode: 'insensitive' } },
			];
		}

		const [items, total] = await Promise.all([
			this.prisma.order.findMany({
				where,
				include: {
					district: true,
					specialty: true,
					master: true,
				},
				orderBy: { createdAt: 'desc' },
				take: query.limit,
				skip: query.offset,
			}),
			this.prisma.order.count({ where }),
		]);

		return {
			items: items.map((order) => this.mapAdminOrder(order as OrderWithRelations)),
			total,
			limit: query.limit,
			offset: query.offset,
		};
	}


	async findOneForAdmin(orderId: string) {
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


		return this.mapAdminOrder(order as OrderWithRelations);
	}


	async updateOrderForAdmin(orderId: string, dto: AdminUpdateOrderDto, performedByUserId: string) {
		if (dto.price !== undefined && dto.price < 0) {
			throw new BadRequestException('Price must be >= 0');
		}


		return this.prisma.$transaction(async (tx) => {
			const existing = await tx.order.findUnique({
				where: { id: orderId },
				select: {
					id: true,
					status: true,
					masterId: true,
					amoLeadId: true,
				},
			});


			if (!existing) {
				throw new NotFoundException(`Order ${orderId} not found`);
			}


			let masterIdToSet: string | null | undefined;
			if (dto.unassignMaster) {
				masterIdToSet = null;
			} else if (dto.masterId !== undefined) {
				const master = await tx.masterProfile.findUnique({
					where: { id: dto.masterId },
					select: { id: true, status: true },
				});


				if (!master) {
					throw new NotFoundException(`Master ${dto.masterId} not found`);
				}


				if (master.status === MasterStatus.BLOCKED) {
					throw new ConflictException('Cannot assign blocked master');
				}


				masterIdToSet = master.id;
			}


			const data: Prisma.OrderUpdateInput = {};


			if (dto.status) {
				data.status = dto.status;
			}


			if (dto.price !== undefined) {
				data.price = new Prisma.Decimal(dto.price).toDecimalPlaces(2);
			}


			if (masterIdToSet !== undefined) {
				data.master = masterIdToSet === null
					? { disconnect: true }
					: { connect: { id: masterIdToSet } };
			}


			const updated = await tx.order.update({
				where: { id: orderId },
				data,
				include: {
					district: true,
					specialty: true,
					master: true,
				},
			});

			// Update Cache on Admin change
			if (dto.status) {
				await this.redis.set(`order:status:${orderId}`, dto.status, 'EX', 3600);
			}


			await tx.orderLog.create({
				data: {
					orderId,
					message: 'Order manually updated by admin',
					meta: {
						byUserId: performedByUserId,
						changes: {
							status: dto.status ?? updated.status,
							price: dto.price ?? (updated.price ? new Prisma.Decimal(updated.price).toNumber() : null),
							masterId: masterIdToSet ?? updated.masterId,
						},
					},
				},
			});


			if (dto.status === OrderStatus.COMPLETED) {
				await this.payoutsService.creditForOrderCompletion(tx, {
					orderId,
					performedByUserId,
				});
			}


			return this.mapAdminOrder(updated as OrderWithRelations);
		});
	}

	private mapAdminOrder(order: OrderWithRelations) {
		const price = order.price ? new Prisma.Decimal(order.price).toNumber() : null;

		return {
			...order,
			price,
			master: order.master
				? {
					id: order.master.id,
					firstName: order.master.firstName,
					lastName: order.master.lastName,
					phone: order.master.phone,
					status: order.master.status,
				}
				: null,
		};
	}
}
