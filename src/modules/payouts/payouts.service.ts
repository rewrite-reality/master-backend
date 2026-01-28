import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentType,
  PayoutStatus,
  PayoutType,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  async creditForOrderCompletion(
    tx: Prisma.TransactionClient,
    params: { orderId: string; performedByUserId: string },
  ): Promise<{
    payoutId: string;
    amount: Prisma.Decimal;
    percent: number;
  } | null> {
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
      throw new ConflictException(
        'Order must be completed before payout can be credited',
      );
    }

    if (!order.masterId) {
      throw new ConflictException(
        'Cannot credit payout: order has no assigned master',
      );
    }

    if (!order.price) {
      throw new ConflictException(
        'Cannot credit payout: order price is missing',
      );
    }

    const price = new Prisma.Decimal(order.price);

    if (price.lte(0)) {
      throw new ConflictException(
        'Cannot credit payout: order price must be greater than zero',
      );
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
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

  async createManualAdjustment(
    tx: Prisma.TransactionClient,
    params: {
      masterId: string;
      orderId: string;
      amount: number;
      performedByUserId: string;
      type?: PayoutType;
      note?: string;
      percentOverride?: number;
      direction?: 'CREDIT' | 'DEBIT';
    },
  ) {
    const {
      masterId,
      orderId,
      amount,
      performedByUserId,
      type = PayoutType.ADJUSTMENT,
      note,
      percentOverride,
      direction = 'CREDIT',
    } = params;

    const normalizedAmount = new Prisma.Decimal(amount);

    if (normalizedAmount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        masterId: true,
        price: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.masterId && order.masterId !== masterId) {
      throw new ConflictException('Order is assigned to a different master');
    }

    const masterProfile = await tx.masterProfile.findUnique({
      where: { id: masterId },
      select: {
        id: true,
        payoutPercent: true,
      },
    });

    if (!masterProfile) {
      throw new NotFoundException(`Master profile ${masterId} not found`);
    }

    let percent = percentOverride ?? masterProfile.payoutPercent ?? 50;
    if (percent < 1 || percent > 100) {
      percent = 50;
    }

    const directionSign = direction === 'DEBIT' ? -1 : 1;
    const signedAmount = normalizedAmount.mul(directionSign).toDecimalPlaces(2);

    const existingPayout = await tx.payout.findUnique({
      where: { orderId },
    });

    if (existingPayout) {
      throw new ConflictException('Payout for this order already exists');
    }

    const payout = await tx.payout.create({
      data: {
        masterId,
        orderId,
        amount: signedAmount,
        percent,
        type,
        status: PayoutStatus.POSTED,
        meta: {
          manual: true,
          performedByUserId,
          note: note ?? null,
        },
      },
    });

    await tx.masterProfile.update({
      where: { id: masterId },
      data: { balance: { increment: signedAmount } },
    });

    await tx.orderLog.create({
      data: {
        orderId,
        message: 'Manual payout adjustment posted',
        meta: {
          payoutId: payout.id,
          amount: signedAmount.toNumber(),
          percent,
          type,
          performedByUserId,
        },
      },
    });

    return payout;
  }

  // Комиссия за наличный/переводной заказ: фиксируем долг мастера и блокировку при превышении лимита
  async accrueCommission(
    tx: Prisma.TransactionClient,
    orderId: string,
    masterId: string,
  ): Promise<{ debt: Prisma.Decimal; isBlockedByDebt: boolean }> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        price: true,
        masterId: true,
        paymentType: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== OrderStatus.COMPLETED) {
      throw new ConflictException(
        'Order must be completed before commission accrual',
      );
    }

    if (
      order.paymentType !== PaymentType.CASH &&
      order.paymentType !== PaymentType.TRANSFER
    ) {
      throw new ConflictException(
        'Commission accrual is only applicable for cash/transfer orders',
      );
    }

    if (!order.price) {
      throw new ConflictException(
        'Cannot accrue commission: order price is missing',
      );
    }

    if (order.masterId && order.masterId !== masterId) {
      throw new ConflictException('Order is assigned to a different master');
    }

    const masterProfile = await tx.masterProfile.findUnique({
      where: { id: masterId },
      select: {
        id: true,
        payoutPercent: true,
        debt: true,
        debtLimit: true,
      },
    });

    if (!masterProfile) {
      throw new NotFoundException(`Master profile ${masterId} not found`);
    }

    const existingAccrual = await tx.transaction.findUnique({
      where: {
        orderId_type: { orderId: order.id, type: TransactionType.FEE_ACCRUAL },
      },
      select: { id: true, masterId: true },
    });

    if (existingAccrual) {
      if (existingAccrual.masterId !== masterId) {
        this.logger.error(
          `Commission already accrued for order ${order.id} by master ${existingAccrual.masterId}, attempted master ${masterId}`,
        );
        throw new ConflictException(
          'Commission already accrued to another master',
        );
      }

      const currentProfile = await tx.masterProfile.findUnique({
        where: { id: masterId },
        select: { debt: true, isBlockedByDebt: true },
      });

      if (!currentProfile) {
        throw new NotFoundException(`Master profile ${masterId} not found`);
      }

      return {
        debt: currentProfile.debt,
        isBlockedByDebt: currentProfile.isBlockedByDebt,
      };
    }

    const price = new Prisma.Decimal(order.price);

    if (price.lte(0)) {
      throw new ConflictException(
        'Cannot accrue commission: order price must be greater than zero',
      );
    }

    let payoutPercent = masterProfile.payoutPercent ?? 50;
    if (payoutPercent <= 0 || payoutPercent >= 100) {
      this.logger.warn(
        `Invalid payoutPercent ${payoutPercent} for master ${masterProfile.id}; falling back to 50`,
      );
      payoutPercent = 50;
    }

    const commissionPercent = 100 - payoutPercent;
    const commissionAmount = price
      .mul(commissionPercent)
      .div(100)
      .toDecimalPlaces(2);

    if (commissionAmount.lte(0)) {
      throw new ConflictException(
        'Cannot accrue commission: calculated amount is not positive',
      );
    }

    let transaction;
    try {
      transaction = await tx.transaction.create({
        data: {
          masterId,
          orderId: order.id,
          type: TransactionType.FEE_ACCRUAL,
          amount: commissionAmount,
          status: TransactionStatus.SUCCESS,
        },
      });
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await tx.transaction.findUnique({
          where: {
            orderId_type: {
              orderId: order.id,
              type: TransactionType.FEE_ACCRUAL,
            },
          },
          select: { id: true, masterId: true },
        });

        if (duplicate && duplicate.masterId !== masterId) {
          this.logger.error(
            `Commission already accrued for order ${order.id} by master ${duplicate.masterId}, attempted master ${masterId}`,
          );
          throw new ConflictException(
            'Commission already accrued to another master',
          );
        }

        const currentProfile = await tx.masterProfile.findUnique({
          where: { id: masterId },
          select: { debt: true, isBlockedByDebt: true },
        });

        if (!currentProfile) {
          throw new NotFoundException(`Master profile ${masterId} not found`);
        }

        return {
          debt: currentProfile.debt,
          isBlockedByDebt: currentProfile.isBlockedByDebt,
        };
      }
      throw error;
    }

    const updatedAfterDebtIncrement = await tx.masterProfile.update({
      where: { id: masterId },
      data: { debt: { increment: commissionAmount } },
      select: { debt: true, debtLimit: true },
    });

    const isBlockedByDebt = new Prisma.Decimal(
      updatedAfterDebtIncrement.debt,
    ).gte(updatedAfterDebtIncrement.debtLimit);

    const finalProfile = await tx.masterProfile.update({
      where: { id: masterId },
      data: { isBlockedByDebt },
      select: { debt: true, isBlockedByDebt: true },
    });

    await tx.orderLog.create({
      data: {
        orderId: order.id,
        message: 'Commission accrued as master debt',
        meta: {
          transactionId: transaction.id,
          commissionAmount: commissionAmount.toNumber(),
          commissionPercent,
          masterId,
        },
      },
    });

    return {
      debt: finalProfile.debt,
      isBlockedByDebt: finalProfile.isBlockedByDebt,
    };
  }

  // Погашение долга мастера через PSP: списываем долг, не уходим в минус
  async repayDebt(
    tx: Prisma.TransactionClient,
    masterId: string,
    amount: Prisma.Decimal,
    paymentId: string,
  ): Promise<{ debt: Prisma.Decimal }> {
    const normalizedAmount = new Prisma.Decimal(amount);

    if (normalizedAmount.lte(0)) {
      throw new BadRequestException(
        'Debt payment amount must be greater than zero',
      );
    }

    const masterProfile = await tx.masterProfile.findUnique({
      where: { id: masterId },
      select: { id: true, debt: true, debtLimit: true },
    });

    if (!masterProfile) {
      throw new NotFoundException(`Master profile ${masterId} not found`);
    }

    const existingPayment = await tx.transaction.findFirst({
      where: {
        masterId,
        type: TransactionType.DEBT_PAYMENT,
        externalPaymentId: paymentId,
      },
      select: { id: true },
    });

    if (existingPayment) {
      const currentProfile = await tx.masterProfile.findUnique({
        where: { id: masterId },
        select: { debt: true },
      });

      if (!currentProfile) {
        throw new NotFoundException(`Master profile ${masterId} not found`);
      }

      return { debt: currentProfile.debt };
    }

    await tx.transaction.create({
      data: {
        masterId,
        type: TransactionType.DEBT_PAYMENT,
        amount: normalizedAmount,
        status: TransactionStatus.SUCCESS,
        externalPaymentId: paymentId,
      },
    });

    const updatedProfile = await tx.masterProfile.update({
      where: { id: masterId },
      data: {
        debt: Prisma.Decimal.max(
          new Prisma.Decimal(masterProfile.debt)
            .sub(normalizedAmount)
            .toDecimalPlaces(2),
          new Prisma.Decimal(0),
        ),
      },
      select: { debt: true, debtLimit: true },
    });

    const isBlockedByDebt = new Prisma.Decimal(updatedProfile.debt).gte(
      updatedProfile.debtLimit,
    );

    const finalProfile = await tx.masterProfile.update({
      where: { id: masterId },
      data: { isBlockedByDebt },
      select: { debt: true },
    });

    return { debt: finalProfile.debt };
  }
}
