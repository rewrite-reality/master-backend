import { Injectable, Logger } from '@nestjs/common';
import { AmoWebhookDto } from './dto/amocrm-webhook.dto';
import { AmoCrmMapper, ParsedLeadData } from './amocrm.mapper';
import { AmoCrmApiService } from './amocrm.api.service';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { DadataService } from '../dadata/dadata.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { DispatchMode, PaymentType } from '@prisma/client';
import { DispatchService } from '../../dispatch/dispatch.service';

@Injectable()
export class AmoCrmService {
	private readonly logger = new Logger(AmoCrmService.name);
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
		this.targetStatusId = Number(this.config.get<string>('AMOCRM_TARGET_STATUS_ID', '0'));
	}

	async handleIncomingWebhook(dto: AmoWebhookDto) {
		// Log the raw event
		try {
			await this.prisma.integrationEvent.create({
				data: {
					source: 'AMOCRM',
					direction: 'INCOMING',
					event: dto.leads?.status ? 'leads.status' : 'leads.add',
					payload: JSON.parse(JSON.stringify(dto)),
					isSuccess: true,
				},
			});
		} catch (e) {
			this.logger.error('Failed to log IntegrationEvent', e.stack);
		}

		if (dto.leads?.status) {
			return this.handleStatusChange(dto.leads.status);
		}

		if (dto.leads?.add) {
			return this.handleLeadsAdd(dto.leads.add);
		}

		return { status: 'ignored_event' };
	}

	private async handleStatusChange(leads: any[]) {
		const results: any[] = [];

		for (const lead of leads) {
			try {
				const newStatusId = Number(lead.status_id);
				if (newStatusId !== this.targetStatusId) {
					results.push({ id: lead.id, status: 'ignored_status', statusId: newStatusId });
					continue;
				}

				this.logger.log(`Target status reached (${newStatusId}) for lead ${lead.id}, fetching details...`);

				const fullLead = await this.apiService.getLeadById(lead.id);
				if (!fullLead) {
					this.logger.error(`Failed to fetch details for lead ${lead.id}`);
					results.push({ id: lead.id, status: 'fetch_error' });
					continue;
				}

				let parsed = this.mapper.mapApiResponse(fullLead);
				if (!parsed) {
					this.logger.error(`Failed to map API response for lead ${lead.id}`);
					results.push({ id: lead.id, status: 'map_error' });
					continue;
				}

				parsed = await this.enrichClientDetails(fullLead, parsed);
				await this.processLead(parsed, lead.id, results);
			} catch (error) {
				this.logger.error(`Error processing status change for lead ${lead.id}: ${error.message}`, error.stack);
				results.push({ id: lead.id, status: 'error', error: error.message });
			}
		}

		return { processed: results };
	}

	private async handleLeadsAdd(leads: any[]) {
		const results: any[] = [];
		for (const lead of leads) {
			try {
				const leadId = lead.id;
				const fullLead = await this.apiService.getLeadById(leadId);
				if (!fullLead) {
					this.logger.error(`Failed to fetch details for lead ${leadId}`);
					results.push({ id: leadId, status: 'fetch_error' });
					continue;
				}

				let parsed = this.mapper.mapApiResponse(fullLead);
				if (!parsed) {
					this.logger.error(`Failed to map API response for lead ${leadId}`);
					results.push({ id: leadId, status: 'map_error' });
					continue;
				}

				parsed = await this.enrichClientDetails(fullLead, parsed);
				await this.processLead(parsed, leadId, results);
			} catch (error) {
				this.logger.error(`Error processing lead add ${lead.id}: ${error.message}`, error.stack);
				results.push({ id: lead.id, status: 'error', error: error.message });
			}
		}
		return { processed: results };
	}

	private async processLead(parsed: ParsedLeadData, originalId: string, results: any[]) {
		// 1. Idempotency Check
		const isDuplicate = await this.idempotency.isDuplicate(originalId);
		if (isDuplicate) {
			this.logger.log(`Skipping duplicate lead ${originalId}`);
			results.push({ id: originalId, status: 'skipped_duplicate' });
			return;
		}

		if (!parsed.rawAddress) {
			this.logger.warn(`Lead ${originalId} has no address. Skipping.`);
			results.push({ id: originalId, status: 'skipped_no_address' });
			return;
		}

		// 3. Clean Address
		const address = await this.dadata.cleanAddress(parsed.rawAddress);

		// 4. Lookups
		// District
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

		// If not found by district name, maybe try to match without city?
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
				results.push({ id: originalId, status: 'error_no_district' });
				return;
			}
		}

		// Specialty
		let specialtyId: string | null = null;
		if (parsed.specialtyCode) {
			const specialty = await this.prisma.specialty.findUnique({
				where: { code: parsed.specialtyCode },
			});
			specialtyId = specialty?.id || null;
		}

		// 5. Create Order
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
			specialtyId: specialtyId ?? undefined,
			dispatchMode: DispatchMode.RACE,
			clientName: parsed.clientName || 'Unknown (Amo)',
			clientPhone: parsed.clientPhone || '',
			scheduledAt: parsed.scheduledAt ?? undefined,
		});

		this.logger.log(`Created Order ${order.id} from AmoCRM lead ${originalId}`);
		results.push({ id: originalId, status: 'created', orderId: order.id });
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
