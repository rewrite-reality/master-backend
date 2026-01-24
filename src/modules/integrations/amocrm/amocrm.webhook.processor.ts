import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DispatchMode, PaymentType } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../core/database/prisma.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { DadataService } from '../dadata/dadata.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { AmoCrmApiService } from './amocrm.api.service';
import { AmoCrmMapper, ParsedLeadData } from './amocrm.mapper';

@Injectable()
@Processor('amocrm-webhooks', { concurrency: 5 })
export class AmoCrmWebhookProcessor extends WorkerHost {
	private readonly logger = new Logger(AmoCrmWebhookProcessor.name);
	private readonly targetStatusId: number;

	constructor(
		private readonly prisma: PrismaService,
		private readonly dispatchService: DispatchService,
		private readonly idempotency: IdempotencyService,
		private readonly dadata: DadataService,
		private readonly mapper: AmoCrmMapper,
		private readonly apiService: AmoCrmApiService,
		private readonly config: ConfigService,
	) {
		super();
		this.targetStatusId = Number(this.config.get<string>('AMOCRM_TARGET_STATUS_ID', '0'));
	}

	async process(job: Job<{ lead: any }>) {
		const { lead } = job.data || {};

		if (!lead) {
			this.logger.warn(`Job ${job.id} missing lead payload`);
			return { status: 'no_lead' };
		}

		if (job.name === 'process-status') {
			return this.handleStatusChange(lead);
		}

		if (job.name === 'process-add') {
			return this.handleLeadAdd(lead);
		}

		this.logger.warn(`Unknown job name ${job.name}`);
		return { status: 'unknown_job' };
	}

	private async handleStatusChange(lead: any) {
		try {
			const newStatusId = Number(lead.status_id);
			if (newStatusId !== this.targetStatusId) {
				return { id: lead.id, status: 'ignored_status', statusId: newStatusId };
			}

			this.logger.log(`Target status reached (${newStatusId}) for lead ${lead.id}, fetching details...`);

			const fullLead = await this.apiService.getLeadById(lead.id);
			if (!fullLead) {
				this.logger.error(`Failed to fetch details for lead ${lead.id}`);
				return { id: lead.id, status: 'fetch_error' };
			}

			let parsed = this.mapper.mapApiResponse(fullLead);
			if (!parsed) {
				this.logger.error(`Failed to map API response for lead ${lead.id}`);
				return { id: lead.id, status: 'map_error' };
			}

			parsed = await this.enrichClientDetails(fullLead, parsed);
			return await this.processLead(parsed, lead.id);
		} catch (error: any) {
			this.logger.error(
				`Error processing status change for lead ${lead.id}: ${error.message}`,
				error.stack,
			);
			return { id: lead.id, status: 'error', error: error.message };
		}
	}

	private async handleLeadAdd(lead: any) {
		try {
			const leadId = lead.id;
			const fullLead = await this.apiService.getLeadById(leadId);
			if (!fullLead) {
				this.logger.error(`Failed to fetch details for lead ${leadId}`);
				return { id: leadId, status: 'fetch_error' };
			}

			let parsed = this.mapper.mapApiResponse(fullLead);
			if (!parsed) {
				this.logger.error(`Failed to map API response for lead ${leadId}`);
				return { id: leadId, status: 'map_error' };
			}

			parsed = await this.enrichClientDetails(fullLead, parsed);
			return await this.processLead(parsed, leadId);
		} catch (error: any) {
			this.logger.error(`Error processing lead add ${lead.id}: ${error.message}`, error.stack);
			return { id: lead.id, status: 'error', error: error.message };
		}
	}

	private async processLead(parsed: ParsedLeadData, originalId: string) {
		const isDuplicate = await this.idempotency.isDuplicate(originalId);
		if (isDuplicate) {
			this.logger.log(`Skipping duplicate lead ${originalId}`);
			return { id: originalId, status: 'skipped_duplicate' };
		}

		if (!parsed.rawAddress) {
			this.logger.warn(`Lead ${originalId} has no address. Skipping.`);
			return { id: originalId, status: 'skipped_no_address' };
		}

		const existingOrder = await this.prisma.order.findUnique({
			where: { amoLeadId: parsed.amoId },
			select: { id: true },
		});

		if (existingOrder) {
			this.logger.log(`Order already exists for Amo lead ${originalId}, skipping creation`);
			return { id: originalId, status: 'skipped_existing_order', orderId: existingOrder.id };
		}

		const address = await this.dadata.cleanAddress(parsed.rawAddress);

		let districtId: string | null = null;
		if (address.district) {
			const district = await this.prisma.district.findFirst({
				where: {
					name: address.district,
					city: address.city || 'Chelyabinsk',
				},
			});
			districtId = district?.id || null;
		}

		if (!districtId && address.district) {
			const district = await this.prisma.district.findFirst({
				where: {
					name: address.district,
				},
			});
			districtId = district?.id || null;
		}

		if (!districtId) {
			const anyDistrict = await this.prisma.district.findFirst();
			if (anyDistrict) {
				districtId = anyDistrict.id;
				this.logger.warn(`District '${address.district}' not found. Using fallback district '${anyDistrict.name}'.`);
			} else {
				this.logger.error(`No districts found in DB. Cannot create order for lead ${originalId}.`);
				return { id: originalId, status: 'error_no_district' };
			}
		}

		let specialtyId: string | null = null;
		if (parsed.specialtyCode) {
			const specialty = await this.prisma.specialty.findUnique({
				where: { code: parsed.specialtyCode },
			});
			specialtyId = specialty?.id || null;
		}

		const order = await this.dispatchService.createOrder({
			amoLeadId: parsed.amoId,
			title: parsed.title,
			description: parsed.description || '',
			price: parsed.price,
			paymentType: (parsed.paymentType as PaymentType) || PaymentType.CASH,
			districtId: districtId!,
			city: address.city || 'Chelyabinsk',
			street: address.street,
			house: address.house || '',
			apartment: address.flat ?? undefined,
			geo_lat: address.geo_lat ?? undefined,
			geo_lon: address.geo_lon ?? undefined,
			specialtyId: specialtyId ?? undefined,
			dispatchMode: DispatchMode.RACE,
			clientName: parsed.clientName || 'Unknown (Amo)',
			clientPhone: parsed.clientPhone || '',
			scheduledAt: parsed.scheduledAt ?? undefined,
		});

		this.logger.log(`Created Order ${order.id} from AmoCRM lead ${originalId}`);
		return { id: originalId, status: 'created', orderId: order.id };
	}

	private extractPhoneFromContact(contact: any): string | null {
		if (!contact?.custom_fields_values) return null;

		const phoneField = contact.custom_fields_values.find((field: any) =>
			['PHONE', 'MOBILE'].includes(String(field.field_code || '').toUpperCase()),
		);
		const rawPhone = phoneField?.values?.[0]?.value;
		return rawPhone ? String(rawPhone) : null;
	}

	private async enrichClientDetails(fullLead: any, parsed: ParsedLeadData): Promise<ParsedLeadData> {
		const mainContact = fullLead?._embedded?.contacts?.[0] || null;
		const contactId = mainContact?.id;

		let clientName = mainContact?.name || parsed.clientName || 'Unknown (Amo)';
		let clientPhone = parsed.clientPhone ?? null;

		if (!clientPhone) {
			clientPhone = this.extractPhoneFromContact(mainContact);
		}

		if (!clientPhone && contactId) {
			const contact = await this.apiService.getContactById(contactId);
			if (contact) {
				clientPhone = this.extractPhoneFromContact(contact);
				if (contact.name) {
					clientName = contact.name;
				}
			} else {
				this.logger.warn(`Could not resolve contact ${contactId} for lead ${parsed.amoId}`);
			}
		}

		return {
			...parsed,
			clientName: clientName || 'Unknown (Amo)',
			clientPhone,
		};
	}
}
