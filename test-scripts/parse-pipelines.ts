// test-scripts/parse-pipelines.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import axios from 'axios';

async function bootstrap() {
	const logger = new Logger('PipelineInspector');

	// 1. Создаем контекст приложения (чтобы подтянуть ConfigService)
	const app = await NestFactory.createApplicationContext(AppModule, {
		logger: ['error', 'warn'], // Меньше шума в логах
	});

	const config = app.get(ConfigService);
	const subdomain = config.get('AMOCRM_SUBDOMAIN');
	const accessToken = config.get('AMOCRM_ACCESS_TOKEN');

	if (!subdomain || !accessToken) {
		logger.error('❌ Не найдены AMOCRM_SUBDOMAIN или AMOCRM_ACCESS_TOKEN в .env');
		process.exit(1);
	}

	logger.log(`🔌 Подключение к ${subdomain}.amocrm.ru...`);

	try {
		// 2. Делаем прямой запрос к API, чтобы получить воронки
		const response = await axios.get(`https://${subdomain}.amocrm.ru/api/v4/leads/pipelines`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		const pipelines = response.data?._embedded?.pipelines || [];

		logger.log('=============================================');
		logger.log(`🚀 НАЙДЕНО ВОРОНОК: ${pipelines.length}`);
		logger.log('=============================================');

		pipelines.forEach((pipeline: any) => {
			console.log(`\n📂 ВОРОНКА: "${pipeline.name}" (ID: ${pipeline.id})`);
			if (pipeline.is_main) console.log('   ⭐️ (Основная воронка)');

			console.log('   📋 СТАТУСЫ:');
			const statuses = pipeline._embedded?.statuses || [];

			statuses.forEach((status: any) => {
				// Пропускаем системный статус "Неразобранное" (id: 1), если не нужен
				console.log(`      👉 ${status.id}: "${status.name}" (Color: ${status.color})`);
			});

			// Генерируем готовый конфиг для .env
			console.log('\n   📝 .env SNIPPET (скопируй это):');
			console.log(`   AMO_PIPELINE_ID=${pipeline.id}`);

			// Пытаемся угадать маппинг по именам (можно подправить)
			statuses.forEach((s: any) => {
				if (s.name === 'Первичный контакт') console.log(`   # AMO_STATUS_NEW=${s.id}`);
				if (s.name === 'Мастер найден') console.log(`   AMO_STATUS_ASSIGNED=${s.id}`);
				if (s.name === 'Мастер на месте') console.log(`   AMO_STATUS_ARRIVED=${s.id}`);
				if (s.name === 'Работает' || s.name === 'В работе') console.log(`   AMO_STATUS_IN_PROGRESS=${s.id}`);
				if (s.name === 'Проверка') console.log(`   AMO_STATUS_REVIEW=${s.id}`);
				if (s.name === 'Успешно реализовано') console.log(`   AMO_STATUS_COMPLETED=${s.id}`);
				if (s.name === 'Закрыто и не реализовано') console.log(`   AMO_STATUS_CANCELLED=${s.id}`);
			});
			console.log('---------------------------------------------');
		});

	} catch (error: any) {
		logger.error('❌ Ошибка при запросе к AmoCRM:');
		if (error.response) {
			console.error(`Status: ${error.response.status}`);
			console.error(JSON.stringify(error.response.data, null, 2));
		} else {
			console.error(error.message);
		}
	}

	await app.close();
}

bootstrap();
