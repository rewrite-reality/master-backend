# Master Backend

Backend-система для управления заказами и мастерами "Мастер на час". Интеграция с AmoCRM, автоматическое распределение заказов и уведомления в Telegram.

## Основные возможности

- **Управление заказами**: Полный жизненный цикл заказа (от создания в CRM до завершения мастером).
- **Система "Гонка" (Race Mode)**: Свободное распределение заказов — кто первый принял, тот и исполнитель.
- **Интеграция с AmoCRM (v4)**: Двусторонняя синхронизация сделок, автоматическое создание заказов при переходе в целевой статус.
- **Telegram Bot**: Уведомления мастеров о новых заказах, управление профилем и статусом работы через Mini App.
- **Мастера и профили**: Система рейтингов, привязка к районам города и специальностям.
- **Гео-данные**: Интеграция с Dadata для нормализации адресов и автоматического определения района.
- **Обработка выплат**: Автоматический расчет вознаграждения мастера на основе выполненных заказов.
- **Безопасность**: JWT-авторизация, Role-Based Access Control (Admin, Manager, Master).

## Стек технологий

- **Framework**: [NestJS](https://nestjs.com/) (Node.js)
- **Database**: PostgreSQL
- **ORM**: [Prisma](https://www.prisma.io/)
- **Queues & Cache**: Redis + [BullMQ](https://docs.bullmq.io/)
- **CRM Integration**: AmoCRM API v4
- **Notifications**: Telegraf (Telegram Bot API)
- **Data Validation**: class-validator, Joi
- **API Documentation**: Swagger (OpenAPI 3.0)

## Структура проекта

```text
src/
├── core/             # Глобальные фильтры, перехватчики, декораторы
├── modules/          # Функциональные модули
│   ├── auth/         # Авторизация и JWT стратегии
│   ├── users/        # Управление пользователями и профилями мастеров
│   ├── orders/       # Логика заказов и их жизненный цикл
│   ├── dispatch/     # Распределение заказов (Race mode)
│   ├── integrations/ # Внешние API: AmoCRM, Dadata, Idempotency
│   ├── notifications/# Telegram бот и уведомления
│   ├── payouts/      # Финансовые расчеты и баланс
│   ├── districts/    # Справочник районов
│   └── specialties/  # Справочник квалификаций мастеров
├── main.ts           # Точка входа
└── app.module.ts     # Корневой модуль
```

## Быстрый старт

### Требования
- Node.js v20+
- Docker & Docker Compose (для PostgreSQL и Redis)

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка окружения
Создайте файл `.env` в корне проекта на основе текущего примера:
```env
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/master_na_chas"
REDIS_HOST=localhost
REDIS_PORT=6379
TELEGRAM_BOT_TOKEN="your_bot_token"
JWT_SECRET="your_secret"
AMOCRM_CLIENT_ID="..."
AMOCRM_CLIENT_SECRET="..."
AMOCRM_SUBDOMAIN="..."
DADATA_API_KEY="..."
```

### 3. Запуск инфраструктуры
```bash
docker-compose up -d
```

### 4. Подготовка базы данных
```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Запуск приложения
```bash
# Режим разработки
npm run start:dev

# Продакшн
npm run build
npm run start:prod
```

## Тестирование и качество кода

В проекте используются Jest для тестов и ESLint/Prettier для поддержания качества кода.

```bash
# Запуск юнит-тестов
npm run test

# Запуск e2e тестов
npm run test:e2e

# Проверка покрытия тестами
npm run test:cov

# Проверка кода линтером
npm run lint

# Форматирование кода
npm run format
```

## Документация API

После запуска приложения Swagger UI доступен по адресу:
`http://localhost:3000/api/docs`

## 🛡 Лицензия

Этот проект является частной собственностью команды **Rewrite Reality RRM**. Все права защищены.
