import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  ConfirmationEnum,
  CreatePaymentRequest,
  CurrencyEnum,
  PaymentStatusEnum,
  VatCodesEnum,
  YookassaService as ExternalYookassaService,
} from 'nestjs-yookassa';
import { PrismaService } from '../../../core/database/prisma.service';
import { PayoutsService } from '../../payouts/payouts.service';

const DEFAULT_RETURN_URL = 'https://t.me/masterapp_bot';
const METADATA_TYPE = 'DEBT_PAYMENT';
const DEFAULT_SYNC_DELAY_MS = 60_000;
const RETRY_BASE_DELAY_MS = 45_000;
const RETRY_MAX_DELAY_MS = 15 * 60_000;

type SyncTrigger = 'create' | 'webhook' | 'manual' | 'retry';

type SyncJobPayload = {
  paymentId: string;
  trigger?: SyncTrigger;
  attempt?: number;
};

@Injectable()
export class YookassaService {
  private readonly logger = new Logger(YookassaService.name);

  constructor(
    private readonly yookassa: ExternalYookassaService,
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
    private readonly configService: ConfigService,
    @InjectQueue('yookassa')
    private readonly queue: Queue<SyncJobPayload>,
  ) {}

  async createPayment(userId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const masterProfile = await this.prisma.masterProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: { select: { email: true } },
      },
    });

    if (!masterProfile) {
      throw new NotFoundException('Master profile not found');
    }

    const email = masterProfile.user?.email?.trim();
    if (!email) {
      throw new BadRequestException(
        'Email is required to issue a fiscal receipt',
      );
    }

    const amountDecimal = new Prisma.Decimal(amount).toDecimalPlaces(2);
    const returnUrl =
      this.configService.get<string>('YOOKASSA_RETURN_URL') ??
      DEFAULT_RETURN_URL;

    const paymentRequest: CreatePaymentRequest<{
      masterId: string;
      type: string;
    }> = {
      amount: {
        value: amountDecimal.toNumber(),
        currency: CurrencyEnum.RUB,
      },
      capture: true,
      confirmation: {
        type: ConfirmationEnum.REDIRECT,
        return_url: returnUrl,
      },
      description: 'Debt repayment',
      metadata: {
        masterId: masterProfile.id,
        type: METADATA_TYPE,
      },
      receipt: {
        customer: { email },
        items: [
          {
            description: 'Commission payment',
            quantity: 1,
            amount: {
              value: amountDecimal.toNumber(),
              currency: CurrencyEnum.RUB,
            },
            vat_code: VatCodesEnum.NDS_NONE,
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
    };

    const payment = await this.yookassa.payments.create(paymentRequest);

    const paymentId = payment.id;
    const confirmation =
      (payment.confirmation as { confirmation_url?: string } | undefined) ?? {};
    const paymentUrl = confirmation.confirmation_url ?? null;

    if (!paymentUrl) {
      throw new BadRequestException(
        'Failed to obtain a confirmation URL from YooKassa',
      );
    }

    await this.prisma.transaction.create({
      data: {
        masterId: masterProfile.id,
        type: TransactionType.DEBT_PAYMENT,
        amount: amountDecimal,
        status: TransactionStatus.PENDING,
        externalPaymentId: paymentId,
      },
    });

    await this.enqueueSync(paymentId, 'create', DEFAULT_SYNC_DELAY_MS);

    return {
      paymentUrl,
      paymentId,
      status: payment.status,
    };
  }

  // Backward compatibility with legacy callers
  async createDebtPayment(userId: string, amount: number) {
    return this.createPayment(userId, amount);
  }

  async handleWebhook(payload: any) {
    const eventType = payload?.event ?? payload?.type ?? 'unknown';
    const paymentId = payload?.object?.id ?? payload?.payment_id ?? null;

    this.logger.log(
      `YooKassa webhook received: event=${eventType}, paymentId=${paymentId}`,
    );

    if (!paymentId) {
      this.logger.warn('Webhook ignored: missing payment id');
      return { status: 'ignored' };
    }

    try {
      await this.enqueueSync(paymentId, 'webhook');
      return { status: 'queued' };
    } catch (error: any) {
      this.logger.error(
        `Failed to enqueue sync for payment ${paymentId} from webhook: ${error?.message || error}`,
        error?.stack,
      );
      return { status: 'error' };
    }
  }

  async enqueueSyncJob(paymentId: string, trigger: SyncTrigger = 'manual') {
    if (!paymentId) {
      throw new BadRequestException('paymentId is required to enqueue sync');
    }

    await this.enqueueSync(paymentId, trigger);
    this.logger.log(
      `Manual sync job enqueued for payment ${paymentId} (trigger=${trigger})`,
    );
  }

  async syncPayment(
    paymentId: string,
    trigger: SyncTrigger = 'manual',
    attempt = 0,
  ) {
    if (!paymentId) {
      this.logger.warn('syncPayment called without paymentId');
      return;
    }

    this.logger.log(
      `Sync attempt ${attempt + 1} for payment ${paymentId} (trigger=${trigger})`,
    );

    let payment;
    try {
      payment = await this.yookassa.payments.getById(paymentId);
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch payment ${paymentId} from YooKassa: ${error?.message || error}`,
        error?.stack,
      );
      throw error;
    }

    if (!payment) {
      this.logger.warn(`YooKassa returned empty payment for id ${paymentId}`);
      return;
    }

    const amountValue = payment.amount?.value;
    const amountDecimal =
      amountValue !== undefined && amountValue !== null
        ? new Prisma.Decimal(amountValue)
        : null;

    const transaction = await this.prisma.transaction.findFirst({
      where: {
        externalPaymentId: paymentId,
        type: TransactionType.DEBT_PAYMENT,
      },
      select: { id: true, status: true, masterId: true },
    });

    if (!transaction) {
      this.logger.warn(
        `Transaction not found for payment ${paymentId}; skipping sync`,
      );
      return;
    }

    if (transaction.status === TransactionStatus.SUCCESS) {
      this.logger.debug(
        `Transaction ${transaction.id} already SUCCESS; skipping`,
      );
      return;
    }

    const targetStatus = this.mapStatus(payment.status);

    if (!amountDecimal || amountDecimal.lte(0)) {
      this.logger.warn(
        `Sync skipped: invalid amount for payment ${paymentId}, status ${payment.status}`,
      );
      return;
    }

    if (targetStatus === TransactionStatus.PENDING) {
      await this.enqueueSync(
        paymentId,
        'retry',
        this.computeRetryDelay(attempt),
        attempt + 1,
      );
      return;
    }

    if (targetStatus === TransactionStatus.SUCCESS) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.transaction.findUnique({
          where: { id: transaction.id },
          select: { status: true },
        });

        if (!current) {
          this.logger.warn(
            `Transaction ${transaction.id} disappeared during sync`,
          );
          return;
        }

        if (current.status === TransactionStatus.SUCCESS) {
          return;
        }

        await this.payoutsService.repayDebt(
          tx,
          transaction.masterId,
          amountDecimal,
          paymentId,
        );

        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.SUCCESS,
            amount: amountDecimal.toDecimalPlaces(2),
          },
        });
      });

      this.logger.log(`Payment ${paymentId} transitioned to SUCCESS`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.transaction.findUnique({
        where: { id: transaction.id },
        select: { status: true },
      });

      if (!current) {
        return;
      }

      if (current.status !== TransactionStatus.SUCCESS) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.FAILED,
            amount: amountDecimal.toDecimalPlaces(2),
          },
        });
      }
    });

    this.logger.warn(`Payment ${paymentId} transitioned to FAILED`);
  }

  private mapStatus(status: PaymentStatusEnum | string): TransactionStatus {
    switch (status) {
      case PaymentStatusEnum.SUCCEEDED:
        return TransactionStatus.SUCCESS;
      case PaymentStatusEnum.CANCELED:
        return TransactionStatus.FAILED;
      case PaymentStatusEnum.WAITING_FOR_CAPTURE:
      case PaymentStatusEnum.PENDING:
      default:
        return TransactionStatus.PENDING;
    }
  }

  private computeRetryDelay(attempt: number): number {
    const factor = Math.max(attempt + 1, 1);
    const delay = RETRY_BASE_DELAY_MS * factor;
    return Math.min(delay, RETRY_MAX_DELAY_MS);
  }

  private async enqueueSync(
    paymentId: string,
    trigger: SyncTrigger,
    delayMs = 0,
    attempt = 0,
  ) {
    // BullMQ forbids ":" in custom jobIds; use dashes for safety.
    const jobId = `yookassa-sync-${paymentId}-${trigger}-${Date.now()}`;

    await this.queue.add(
      'sync',
      { paymentId, trigger, attempt },
      {
        jobId,
        delay: delayMs,
        removeOnComplete: 500,
        removeOnFail: 500,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
