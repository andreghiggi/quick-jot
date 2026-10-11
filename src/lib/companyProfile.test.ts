import assert from 'node:assert/strict';
import { describe, it as test } from 'vitest';
import { DEFAULT_PRIMARY_HEX, FLORIST_PRIMARY_HEX, getCompanyTerminology, getPublicMenuColor, getProductTagline, usesTableService } from './companyProfile.ts';

describe('company profile isolation', () => {
  test('restaurant keeps Cardápio and the current red identity', () => {
    assert.equal(getCompanyTerminology(false).onlineMenu, 'Cardápio online');
    assert.equal(getPublicMenuColor(false, DEFAULT_PRIMARY_HEX), DEFAULT_PRIMARY_HEX);
  });

  test('florist uses Catálogo and the logo dark green by default', () => {
    assert.equal(getCompanyTerminology(true).onlineMenu, 'Catálogo online');
    assert.equal(getPublicMenuColor(true, DEFAULT_PRIMARY_HEX), FLORIST_PRIMARY_HEX);
  });

  test('a saved public catalog color has precedence for florists', () => {
    assert.equal(getPublicMenuColor(true, '#126b45'), '#126b45');
  });
});
describe('florist login and table service', () => {
  test('florist tagline and no table service', () => {
    assert.equal(getProductTagline(true), 'Software para Floriculturas');
    assert.equal(usesTableService(true), false);
  });
  test('restaurant keeps tagline and table service', () => {
    assert.equal(getProductTagline(false), 'Software para Restaurantes');
    assert.equal(usesTableService(false), true);
  });
});
