import { validate, parse } from '@tma.js/init-data-node';

function getBotToken() {
	const token =
		process.env.TELEGRAM_BOT_TOKEN ||
		process.env.BOT_TOKEN; // fallback, если где-то старое имя

	if (!token) {
		throw new Error('Bot token not configured. Set TELEGRAM_BOT_TOKEN (or BOT_TOKEN).');
	}

	return token;
}

/**
 * Валидирует initData (подпись) и возвращает распарсенные данные.
 * Бросает исключение при неверной подписи.
 */
export function verifyTelegramInitData(initData: string) {
	const token = getBotToken();
	validate(initData, token);
	return parse(initData);
}
