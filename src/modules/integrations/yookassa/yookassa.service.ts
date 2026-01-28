import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
	ConfirmationEnum,
	CreatePaymentRequest,
	CurrencyEnum,
	VatCodesEnum,
	YookassaService as ExternalYookassaService,
} from 'nestjs-yookassa';
import { PrismaService } from '../../../core/database/prisma.service';
import { PayoutsService } from '../../payouts/payouts.service';

const DEFAULT_RETURN_URL = 'https://t.me/masterapp_bot';
const METADATA_TYPE = 'DEBT_PAYMENT';

@Injectable()
export class YookassaService {
	private readonly logger = new Logger(YookassaService.name);

	constructor(
		private readonly yookassa: ExternalYookassaService,
		private readonly prisma: PrismaService,
		private readonly payoutsService: PayoutsService,
		private readonly configService: ConfigService,
	) { }

	async createDebtPayment(userId: string, amount: number) {
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

		const value = Number(amount.toFixed(2));
		const returnUrl =
			this.configService.get<string>('YOOKASSA_RETURN_URL') ??
			DEFAULT_RETURN_URL;

		const paymentRequest: CreatePaymentRequest<{
			masterId: string;
			type: string;
		}> = {
			amount: {
				value,
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
						amount: { value, currency: CurrencyEnum.RUB },
						vat_code: VatCodesEnum.NDS_NONE,
						payment_mode: 'full_payment',
						payment_subject: 'service',
					},
				],
			},
		};

		const payment = await this.yookassa.payments.create(paymentRequest);

		const paymentUrl =
			(payment.confirmation as { confirmation_url?: string } | undefined)
				?.confirmation_url ?? null;

		if (!paymentUrl) {
			throw new BadRequestException(
				'Failed to obtain a confirmation URL from YooKassa',
			);
		}

		return {
			paymentUrl,
			paymentId: payment.id,
		};
	}

	async handleWebhook(event: any) {
		const eventType = event?.event;
		const paymentObject = event?.object;
		const paymentId = paymentObject?.id;
		const paymentStatus = paymentObject?.status;

		this.logger.log(
			`YooKassa webhook received: event=${eventType}, id=${paymentId}, status=${paymentStatus}`,
		);

		if (eventType !== 'payment.succeeded' || !paymentObject || !paymentId) {
			return { status: 'ok' };
		}

		const metadata = paymentObject.metadata ?? {};
		if (metadata?.type !== METADATA_TYPE || !metadata.masterId) {
			return { status: 'ok' };
		}

		const amountRaw = paymentObject.amount?.value;
		const amountDecimal = amountRaw ? new Prisma.Decimal(amountRaw) : null;

		if (!amountDecimal || amountDecimal.lte(0)) {
			this.logger.warn(
				`Webhook skipped: invalid amount for payment ${paymentId}`,
			);
			return { status: 'ok' };
		}

		const masterId = metadata.masterId as string;

		await this.prisma.$transaction(async (tx) => {
			await this.payoutsService.repayDebt(
				tx,
				masterId,
				amountDecimal,
				paymentId,
			);
		});

		return { status: 'ok' };
	}
}
