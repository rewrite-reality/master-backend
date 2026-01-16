import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AmoCrmApiService {
	private readonly logger = new Logger(AmoCrmApiService.name);
	private readonly subdomain: string;
	private readonly accessToken: string;

	constructor(private readonly config: ConfigService) {
		this.subdomain = this.config.get<string>('AMOCRM_SUBDOMAIN', '');
		this.accessToken = this.config.get<string>('AMOCRM_ACCESS_TOKEN', '');
	}

	private get apiBase() {
		return `https://${this.subdomain}.amocrm.ru/api/v4`;
	}

	async getLeadById(leadId: string): Promise<any> {
		if (!this.subdomain || !this.accessToken) {
			this.logger.error('Missing AmoCRM configuration (SUBDOMAIN or ACCESS_TOKEN)');
			return null;
		}

		try {
			const url = `${this.apiBase}/leads/${leadId}?with=contacts`;
			const response = await axios.get(url, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
				},
			});

			return response.data;
		} catch (error: any) {
			this.logger.error(
				`Failed to fetch lead ${leadId} from AmoCRM API: ${error.message}`,
				error.response?.data,
			);
			return null;
		}
	}

	async getContactById(contactId: string | number): Promise<any> {
		if (!this.subdomain || !this.accessToken) {
			this.logger.error('Missing AmoCRM configuration (SUBDOMAIN or ACCESS_TOKEN)');
			return null;
		}

		try {
			const url = `${this.apiBase}/contacts/${contactId}`;
			const response = await axios.get(url, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
				},
			});

			return response.data;
		} catch (error: any) {
			this.logger.error(
				`Failed to fetch contact ${contactId} from AmoCRM API: ${error.message}`,
				error.response?.data,
			);
			return null;
		}
	}

	async updateLeadStatus(params: { leadId: string; statusId: number; pipelineId?: number }): Promise<boolean> {
		if (!this.subdomain || !this.accessToken) {
			this.logger.error('Missing AmoCRM configuration (SUBDOMAIN or ACCESS_TOKEN)');
			return false;
		}

		const { leadId, statusId, pipelineId } = params;

		try {
			const url = `${this.apiBase}/leads/${leadId}`;
			await axios.patch(
				url,
				{
					status_id: statusId,
					...(pipelineId ? { pipeline_id: pipelineId } : {}),
				},
				{
					headers: {
						Authorization: `Bearer ${this.accessToken}`,
					},
				},
			);

			return true;
		} catch (error: any) {
			this.logger.error(
				`Failed to update lead ${leadId} status in AmoCRM: ${error.message}`,
				error.response?.data,
			);
			return false;
		}
	}
}
