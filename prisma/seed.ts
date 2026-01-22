import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	console.log('Start seeding...');

	// 1. Районы (Districts)
	// Я добавил Тракторозаводский и Металлургический, так как их не было на скрине,
	// но они есть в Челябинске (уберите, если не нужны).
	const districts = [
		{ name: 'Ленинский', city: 'Челябинск' },
		{ name: 'Советский', city: 'Челябинск' },
		{ name: 'Центральный', city: 'Челябинск' },
		{ name: 'Калининский', city: 'Челябинск' },
		{ name: 'Курчатовский', city: 'Челябинск' },
		{ name: 'Тракторозаводский', city: 'Челябинск' },
		{ name: 'Металлургический', city: 'Челябинск' },
	];

	console.log('Seeding Districts...');
	for (const district of districts) {
		await prisma.district.upsert({
			// ИСПРАВЛЕНИЕ ЗДЕСЬ: используем составной ключ
			where: {
				city_name: { // Это имя составного ключа в Prisma
					city: district.city,
					name: district.name,
				},
			},
			update: {
				isActive: true,
			},
			create: {
				name: district.name,
				city: district.city,
				isActive: true,
			},
		});
	}


	// 2. Специальности (Specialties)
	const specialties = [
		{ name: 'Сантехник', code: 'plumber' },
		{ name: 'Электрик', code: 'electrician' },
		{ name: 'Муж на час', code: 'handyman' },
		{ name: 'Ремонт бытовой техники', code: 'appliance_repair' },
		{ name: 'Сборщик мебели', code: 'furniture_assembly' },
		{ name: 'Отделочные работы', code: 'finishing_works' },
	];

	console.log('Seeding Specialties...');
	for (const specialty of specialties) {
		await prisma.specialty.upsert({
			where: { code: specialty.code }, // Ищем по уникальному коду
			update: {
				name: specialty.name,
				isActive: true,
			},
			create: {
				name: specialty.name,
				code: specialty.code,
				isActive: true,
			},
		});
	}

	console.log('Seeding completed.');
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
