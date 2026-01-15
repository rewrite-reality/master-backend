import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface DadataAddressResponse {
	result: string;           // Полный нормализованный адрес
	city: string;             // Название города (fallback: "Челябинск")
	street: string;           // Название улицы
	house: string | null;     // Дом
	flat: string | null;      // Квартира
	district: string | null;  // Район города (ключевое поле)
	geo_lat: string | null;   // Широта
	geo_lon: string | null;   // Долгота
}

@Injectable()
export class DadataService {
	private readonly logger = new Logger(DadataService.name);
	private readonly apiUrl = 'https://cleaner.dadata.ru/api/v1/clean/address';

	constructor(private readonly configService: ConfigService) { }

	async cleanAddress(rawAddress: string): Promise<DadataAddressResponse> {
		const apiKey = this.configService.get<string>('DADATA_API_KEY');
		const secretKey = this.configService.get<string>('DADATA_SECRET_KEY');

		// Fallback object
		const fallback: DadataAddressResponse = {
			result: rawAddress,
			city: 'Челябинск',
			street: rawAddress,
			house: null,
			flat: null,
			district: null,
			geo_lat: null,
			geo_lon: null,
		};

		if (!apiKey || !secretKey) {
			this.logger.warn('Dadata API keys not found in config. Returning raw address.');
			return fallback;
		}

		try {
			const response = await axios.post(
				this.apiUrl,
				[rawAddress], // API expects array
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Token ${apiKey}`,
						'X-Secret': secretKey,
					},
					timeout: 5000,
				},
			);

			const data = response.data;

			if (!Array.isArray(data) || data.length === 0) {
				this.logger.warn(`Dadata returned empty or invalid response for address: ${rawAddress}`);
				return fallback;
			}

			const item = data[0];

			return {
				result: item.result || rawAddress,
				city: item.city || 'Челябинск',
				street: item.street || item.source || rawAddress, // Fallback to source if street is missing
				house: item.house || null,
				flat: item.flat || null,
				district: item.city_district || null, // Key field
				geo_lat: item.geo_lat || null,
				geo_lon: item.geo_lon || null,
			};

		} catch (error) {
			this.logger.error(
				`Dadata normalization failed for "${rawAddress}": ${error.message}`,
				error.stack,
			);
			if (error.response) {
				this.logger.error(`Dadata Error Data: ${JSON.stringify(error.response.data)}`);
			}
			// Never throw, always return fallback
			return fallback;
		}
	}
}
