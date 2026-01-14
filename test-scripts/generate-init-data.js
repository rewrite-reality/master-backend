const crypto = require('crypto');

// ---------------------------------------------------------
// 🛠 НАСТРОЙКИ (ЗАПОЛНИТЕ СВОИ ДАННЫЕ)
// ---------------------------------------------------------
const BOT_TOKEN = '8474802139:AAG-8yAcsG67j33UjuQH-Imv0d4yF1p7D18'; // Например: '7000123456:AAGx...'
const USER_DATA = {
	id: 123456714218319,           // Любой ID (например, ваш)
	first_name: 'Ivan',
	username: 'test_master',
	language_code: 'ru'
};
// ---------------------------------------------------------

function generateInitData() {
	// 1. Формируем объект данных (без hash)
	const params = new URLSearchParams();
	params.append('auth_date', Math.floor(Date.now() / 1000));
	params.append('user', JSON.stringify(USER_DATA));
	// Можно добавить query_id, если нужно
	params.append('query_id', 'AAEznBVAAAAAADOcFUAbaAss');

	// 2. Сортируем ключи по алфавиту (требование Telegram)
	const sortedKeys = Array.from(params.keys()).sort();

	// 3. Создаем строку data-check-string (key=value\n)
	const dataCheckString = sortedKeys
		.map(key => `${key}=${params.get(key)}`)
		.join('\n');

	// 4. Генерируем секретный ключ (HMAC-SHA256 от токена бота с ключом 'WebAppData')
	const secretKey = crypto
		.createHmac('sha256', 'WebAppData')
		.update(BOT_TOKEN)
		.digest();

	// 5. Генерируем подпись (HMAC-SHA256 от dataCheckString с секретным ключом)
	const hash = crypto
		.createHmac('sha256', secretKey)
		.update(dataCheckString)
		.digest('hex');

	// 6. Добавляем hash к параметрам
	params.append('hash', hash);

	console.log('\n✅ ВАША ВАЛИДНАЯ INIT DATA ДЛЯ POSTMAN:\n');
	console.log(params.toString());
	console.log('\n---------------------------------------\n');
}

generateInitData();
