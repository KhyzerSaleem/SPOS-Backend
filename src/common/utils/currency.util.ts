import { BadRequestException } from '@nestjs/common';
import { roundMoney } from './money.util';

const COUNTRY_CURRENCY: Record<string, string> = {
  // North America
  'united states': 'USD',
  usa: 'USD',
  us: 'USD',
  canada: 'CAD',
  ca: 'CAD',
  mexico: 'MXN',
  mx: 'MXN',
  // United Kingdom
  'united kingdom': 'GBP',
  uk: 'GBP',
  gb: 'GBP',
  england: 'GBP',
  scotland: 'GBP',
  wales: 'GBP',
  // Eurozone (common members)
  eurozone: 'EUR',
  france: 'EUR',
  germany: 'EUR',
  italy: 'EUR',
  spain: 'EUR',
  netherlands: 'EUR',
  belgium: 'EUR',
  ireland: 'EUR',
  portugal: 'EUR',
  austria: 'EUR',
  greece: 'EUR',
  finland: 'EUR',
  // Other Europe
  switzerland: 'CHF',
  ch: 'CHF',
  sweden: 'SEK',
  norway: 'NOK',
  denmark: 'DKK',
  poland: 'PLN',
  'czech republic': 'CZK',
  hungary: 'HUF',
  romania: 'RON',
  turkey: 'TRY',
  tr: 'TRY',
  russia: 'RUB',
  ukraine: 'UAH',
  // South Asia
  pakistan: 'PKR',
  pk: 'PKR',
  india: 'INR',
  in: 'INR',
  bangladesh: 'BDT',
  bd: 'BDT',
  'sri lanka': 'LKR',
  nepal: 'NPR',
  // Middle East
  'united arab emirates': 'AED',
  uae: 'AED',
  ae: 'AED',
  'saudi arabia': 'SAR',
  sa: 'SAR',
  qatar: 'QAR',
  kuwait: 'KWD',
  bahrain: 'BHD',
  oman: 'OMR',
  jordan: 'JOD',
  israel: 'ILS',
  lebanon: 'LBP',
  iraq: 'IQD',
  // East & Southeast Asia
  china: 'CNY',
  cn: 'CNY',
  japan: 'JPY',
  jp: 'JPY',
  'south korea': 'KRW',
  kr: 'KRW',
  'hong kong': 'HKD',
  singapore: 'SGD',
  sg: 'SGD',
  malaysia: 'MYR',
  my: 'MYR',
  indonesia: 'IDR',
  thailand: 'THB',
  vietnam: 'VND',
  philippines: 'PHP',
  taiwan: 'TWD',
  // Oceania
  australia: 'AUD',
  au: 'AUD',
  'new zealand': 'NZD',
  nz: 'NZD',
  // Africa
  nigeria: 'NGN',
  ng: 'NGN',
  'south africa': 'ZAR',
  za: 'ZAR',
  egypt: 'EGP',
  kenya: 'KES',
  ghana: 'GHS',
  morocco: 'MAD',
  tanzania: 'TZS',
  uganda: 'UGX',
  // South America
  brazil: 'BRL',
  br: 'BRL',
  argentina: 'ARS',
  chile: 'CLP',
  colombia: 'COP',
  peru: 'PEN',
};

export function normalizeCurrencyCode(value?: string | null, fallback = 'USD') {
  const code = String(value || fallback || 'USD')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new BadRequestException(`Invalid currency code "${value}"`);
  }
  return code;
}

export function currencyForCountry(country?: string | null): string | null {
  const key = String(country || '')
    .trim()
    .toLowerCase();
  return COUNTRY_CURRENCY[key] || null;
}

export function convertMoney(value: number, exchangeRate: number) {
  return roundMoney(Number(value || 0) * Number(exchangeRate || 1));
}
