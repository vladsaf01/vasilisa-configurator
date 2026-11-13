/**
 * Контакты и адреса сайта. Сейчас — заглушки сайта-прототипа «Василиса»:
 * перед публикацией заменить на реальные (телефон, мессенджеры, домен).
 */
export const SITE = {
  name: 'Василиса',
  tagline: 'Мебель для дома в Санкт-Петербурге',
  phoneDisplay: '+7 (812) 000-00-00',
  phoneHref: '+78120000000',
  whatsapp: 'https://wa.me/78120000000',
  telegram: 'https://t.me/vasilisa_mebel',
  telegramShare: 'https://t.me/share/url',
  email: 'info@vasilisa-mebel.ru',
  url: 'https://vasilisa-mebel.ru',
  geo: 'Санкт-Петербург и Ленинградская область',
  priceNote: 'Цена ориентировочная: точная — после замера и согласования фурнитуры.',
} as const;

/** Сколько знаков после запятой в ценах — нет, всё в целых рублях. */
export const PRICE_DISCLAIMER = SITE.priceNote;
