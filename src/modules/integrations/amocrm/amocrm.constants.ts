export const AMO_FIELD_IDS = {
	ADDRESS: 1228185,      // Было 1092663 -> Стало 1228185 "Адрес объекта"
	SPECIALTY: 1228187,    // Было 1092667 -> Стало 1228187 "Специальности"
	TIME: 1228481,         // Было 1092669 -> Стало 1228189 "Желаемое время"
	PAYMENT: 1228191,      // Было 1092673 -> Стало 1228191 "Способ оплаты"
	DESCRIPTION: 1228193,  // Было 1092679 -> Стало 1228193 "Описание задачи"
} as const;

export const AMO_SPECIALTY_MAP: Record<number, string> = {
	1390727: 'plumber',    // "Сантехник"
	1390729: 'electrician',// "Электрик"
	1390731: 'handyman',   // "Мастер на час"
};

export const AMO_PAYMENT_MAP: Record<number, string> = {
	1390733: 'CASH',       // "Наличные"
	1390735: 'TRANSFER',   // "Перевод"
	1390737: 'CARD',       // "Карта"
};
