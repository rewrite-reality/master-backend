import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Настройка подключения для Prisma 7
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
	console.log('Start seeding...');

	// 1. Районы (Districts)
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
			where: {
				// Убедитесь, что в schema.prisma у вас определен @@unique([name, city], name: "city_name")
				city_name: {
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
			where: { code: specialty.code },
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
