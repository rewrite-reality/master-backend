import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface DadataAddressResponse {
  result: string; // Полный адрес одной строкой
  city: string; // Город
  street: string; // Улица с типом (ул Ленина)
  house: string | null; // Дом
  flat: string | null; // Квартира
  district: string | null; // Район города
  geo_lat: string | null; // Широта
  geo_lon: string | null; // Долгота
}

@Injectable()
export class DadataService {
  private readonly logger = new Logger(DadataService.name);
  // Используем API Подсказок вместо API Стандартизации
  private readonly apiUrl =
    'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

  constructor(private readonly configService: ConfigService) {}

  async cleanAddress(rawAddress: string): Promise<DadataAddressResponse> {
    const apiKey = this.configService.get<string>('DADATA_API_KEY');

    // Fallback на случай ошибки или отсутствия ключа
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

    if (!apiKey) {
      this.logger.warn('DADATA_API_KEY not found. Returning raw address.');
      return fallback;
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          query: rawAddress, // Ключевое отличие: отправляем объект с полем query
          count: 1, // Нам нужен только 1, самый релевантный вариант
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${apiKey}`, // X-Secret для подсказок не нужен
          },
          timeout: 3000, // Подсказки работают быстро, 3 сек достаточно
        },
      );

      const suggestions = response.data?.suggestions;

      if (!suggestions || suggestions.length === 0) {
        this.logger.warn(`Dadata found no suggestions for: "${rawAddress}"`);
        return fallback;
      }

      const suggestion = suggestions[0];
      const data = suggestion.data;

      return {
        result: suggestion.value || rawAddress, // "г Челябинск, ул Ленина..."
        // Dadata может вернуть city=null для поселков, поэтому проверяем settlement
        city: data.city || data.settlement || data.region || 'Челябинск',
        street: data.street_with_type || data.street || rawAddress,
        house: data.house || null,
        flat: data.flat || null,
        // city_district - это административный район внутри города (напр. "Калининский")
        district: data.city_district || null,
        geo_lat: data.geo_lat || null,
        geo_lon: data.geo_lon || null,
      };
    } catch (error) {
      this.logger.error(
        `Dadata suggestion failed for "${rawAddress}": ${error.message}`,
        error.stack,
      );
      // При необходимости раскомментируйте для отладки
      // if (error.response) {
      //   this.logger.error(`Dadata Error Payload: ${JSON.stringify(error.response.data)}`);
      // }
      return fallback;
    }
  }
}
