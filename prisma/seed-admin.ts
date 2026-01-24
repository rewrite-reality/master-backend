import 'dotenv/config'; // <--- ДОБАВИТЬ ЭТУ СТРОКУ ПЕРВОЙ
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
	const email = 'admin@master.com';
	const password = 'admin1231';

	console.log('Seeding admin user...');
	const passwordHash = await argon2.hash(password);

	const admin = await prisma.user.upsert({
		where: { email },
		update: { role: Role.ADMIN, passwordHash },
		create: {
			email,
			passwordHash,
			role: Role.ADMIN,
		},
	});

	console.log(`Admin user ready: ${admin.email}`);
}

main()
	.catch((error) => {
		console.error('Failed to seed admin:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
