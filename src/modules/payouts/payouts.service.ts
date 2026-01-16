import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PayoutStatus, PayoutType, Prisma } from '@prisma/client';

@Injectable()
export class PayoutsService {
	private readonly logger = new Logger(PayoutsService.name);

	async creditForOrderCompletion(
		tx: Prisma.TransactionClient,
		params: { orderId: string; performedByUserId: string },
	): Promise<{ payoutId: string; amount: Prisma.Decimal; percent: number } | null> {
		const { orderId, performedByUserId } = params;

		const order = await tx.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				status: true,
				price: true,
				masterId: true,
			},
		});

		if (!order) {
			throw new NotFoundException(`Order ${orderId} not found`);
		}

		if (order.status !== OrderStatus.COMPLETED) {
			throw new ConflictException('Order must be completed before payout can be credited');
		}

		if (!order.masterId) {
			throw new ConflictException('Cannot credit payout: order has no assigned master');
		}

		if (!order.price) {
			throw new ConflictException('Cannot credit payout: order price is missing');
		}

		const price = new Prisma.Decimal(order.price);

		if (price.lte(0)) {
			throw new ConflictException('Cannot credit payout: order price must be greater than zero');
		}

		const masterProfile = await tx.masterProfile.findUnique({
			where: { id: order.masterId },
			select: {
				id: true,
				payoutPercent: true,
				balance: true,
			},
		});

		if (!masterProfile) {
			throw new NotFoundException(`Master profile ${order.masterId} not found`);
		}

		let percent = masterProfile.payoutPercent ?? 50;

		if (percent < 50 || percent > 80) {
			this.logger.warn(
				`Invalid payoutPercent ${percent} for master ${masterProfile.id}; falling back to 50`,
			);
			percent = 50;
		}

		const amount = price.mul(percent).div(100).toDecimalPlaces(2);

		const existingPayout = await tx.payout.findUnique({
			where: { orderId: order.id },
			select: { id: true },
		});

		if (existingPayout) {
			return null;
		}

		let payout;

		try {
			payout = await tx.payout.create({
				data: {
					masterId: masterProfile.id,
					orderId: order.id,
					amount,
					percent,
					type: PayoutType.EARNING,
					status: PayoutStatus.POSTED,
					meta: {
						creditedByUserId: performedByUserId,
					},
				},
			});
		} catch (error: any) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				return null;
			}
			throw error;
		}

		await tx.masterProfile.update({
			where: { id: masterProfile.id },
			data: { balance: { increment: amount } },
		});

		await tx.orderLog.create({
			data: {
				orderId: order.id,
				message: 'Payout credited',
				meta: {
					payoutId: payout.id,
					amount: amount.toNumber(),
					percent,
					creditedByUserId: performedByUserId,
				},
			},
		});

		return { payoutId: payout.id, amount, percent };
	}
}
