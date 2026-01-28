import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MapService {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('YANDEX_MAP_API_KEY', '').trim();
    if (!key) {
      throw new Error('YANDEX_MAP_API_KEY is not configured');
    }
    this.apiKey = key;
  }

  generateStaticMapUrl(lat: number, lon: number): string {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Invalid coordinates for static map generation');
    }

    const url = new URL('https://static-maps.yandex.ru/v1');
    url.searchParams.set('ll', `${lon},${lat}`);
    url.searchParams.set('z', '16');
    url.searchParams.set('size', '600,400');
    url.searchParams.set('theme', 'dark');
    url.searchParams.set('pt', `${lon},${lat},pm2rdm`);
    url.searchParams.set('apikey', this.apiKey);

    return url.toString();
  }
}
