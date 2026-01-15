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

	async getLeadById(leadId: string): Promise<any> {
		if (!this.subdomain || !this.accessToken) {
			this.logger.error('Missing AmoCRM configuration (SUBDOMAIN or ACCESS_TOKEN)');
			return null;
		}

		try {
			const url = `https://${this.subdomain}.amocrm.ru/api/v4/leads/${leadId}?with=contacts`;
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
}
