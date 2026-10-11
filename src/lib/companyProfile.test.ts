import { describe, expect, test } from 'bun:test';
import { DEFAULT_PRIMARY_HEX, FLORIST_PRIMARY_HEX, getCompanyTerminology, getPublicMenuColor } from './companyProfile';

describe('company profile isolation', () => {
  test('restaurant keeps Cardápio and the current red identity', () => {
    expect(getCompanyTerminology(false).onlineMenu).toBe('Cardápio online');
    expect(getPublicMenuColor(false, DEFAULT_PRIMARY_HEX)).toBe(DEFAULT_PRIMARY_HEX);
  });

  test('florist uses Catálogo and the logo dark green by default', () => {
    expect(getCompanyTerminology(true).onlineMenu).toBe('Catálogo online');
    expect(getPublicMenuColor(true, DEFAULT_PRIMARY_HEX)).toBe(FLORIST_PRIMARY_HEX);
  });

  test('a saved public catalog color has precedence for florists', () => {
    expect(getPublicMenuColor(true, '#126b45')).toBe('#126b45');
  });
});