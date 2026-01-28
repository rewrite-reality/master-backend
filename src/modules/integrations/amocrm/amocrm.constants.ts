export const AMO_FIELD_IDS = {
  ADDRESS: 1092663,
  SPECIALTY: 1092667,
  TIME: 1092669,
  PAYMENT: 1092673,
  DESCRIPTION: 1092679,
} as const;

export const AMO_SPECIALTY_MAP: Record<number, string> = {
  865179: 'plumber',
  865181: 'electrician',
  865183: 'handyman',
};

export const AMO_PAYMENT_MAP: Record<number, string> = {
  865185: 'CASH',
  865187: 'TRANSFER',
  865189: 'CARD', // Maps to CARD_ONLINE or just CARD depending on internal enum
};
