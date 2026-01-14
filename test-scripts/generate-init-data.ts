import * as crypto from 'crypto';

const BOT_TOKEN = '8474802139:AAG-8yAcsG67j33UjuQH-Imv0d4yF1p7D18'; // Из .env
const userData = {
	id: 123456789,
	first_name: 'Тест',
	last_name: 'Мастер',
	username: 'test_master',
};

const authDate = Math.floor(Date.now() / 1000);
const queryId = 'AAHdF6IQAAAAAN0XohDhrOrc';

const dataCheckString = [
	`auth_date=${authDate}`,
	`query_id=${queryId}`,
	`user=${JSON.stringify(userData)}`,
].join('\n');

const secretKey = crypto
	.createHmac('sha256', 'WebAppData')
	.update(BOT_TOKEN)
	.digest();

const hash = crypto
	.createHmac('sha256', secretKey)
	.update(dataCheckString)
	.digest('hex');

const initData = `auth_date=${authDate}&query_id=${queryId}&user=${encodeURIComponent(JSON.stringify(userData))}&hash=${hash}`;

console.log('InitData:');
console.log(initData);
