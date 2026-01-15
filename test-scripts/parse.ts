// src/scripts/inspect-amocrm.ts
import { NestFactory } from '@nestjs/core';
import { Module, Logger, Controller, Get } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import axios from 'axios';

// Минимальный модуль только для конфига
@Module({
	imports: [ConfigModule.forRoot({ envFilePath: '.env' })],
})
class ScriptModule { }

async function bootstrap() {
	const logger = new Logger('AmoInspector');

	// Создаем контекст приложения без HTTP сервера
	const app = await NestFactory.createApplicationContext(ScriptModule);
	const configService = app.get(ConfigService);

	try {
		const domain = configService.get<string>('AMOCRM_DOMAIN');
		const token = configService.get<string>('AMOCRM_ACCESS_TOKEN');

		if (!domain || !token) {
			logger.error('❌ Ошибка: Не заданы AMOCRM_DOMAIN или AMOCRM_ACCESS_TOKEN в .env');
			await app.close();
			return;
		}

		logger.log(`🔌 Подключение к ${domain}...`);

		// Запрос к API
		const { data: leadsFields } = await axios.get(
			`https://${domain}/api/v4/leads/custom_fields`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);

		logger.log('=============================================');
		logger.log('🚀 СПИСОК КАСТОМНЫХ ПОЛЕЙ (LEADS)');
		logger.log('=============================================');

		if (leadsFields?._embedded?.custom_fields) {
			leadsFields._embedded.custom_fields.forEach((field: any) => {
				logger.log(
					`ID: ${field.id} \t| TYPE: ${field.type.padEnd(10)} | NAME: ${field.name}`
				);

				// Если это список (select/multiselect), выводим варианты
				if (field.enums) {
					const options = field.enums
						.map((e: any) => `\n\t\t👉 ${e.id}: "${e.value}"`)
						.join('');
					logger.log(`\tВарианты:${options}`);
				}
				logger.log('---------------------------------------------');
			});
		} else {
			logger.warn('Кастомные поля не найдены.');
		}

	} catch (error) {
		logger.error('❌ Ошибка запроса:', error.response?.data || error.message);
	} finally {
		await app.close();
	}
}

bootstrap();
