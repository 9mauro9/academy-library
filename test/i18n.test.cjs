const fs = require('fs');
const path = require('path');

describe('Academy Library - i18n Translation Completeness & Parity', () => {
  const localesDir = path.join(__dirname, '../src/i18n/locales');
  const localeFiles = ['en-US.ts', 'es-ES.ts', 'it-IT.ts', 'fr-FR.ts', 'de-DE.ts', 'pl-PL.ts'];

  test('All 6 required locale files exist', () => {
    localeFiles.forEach(file => {
      const filePath = path.join(localesDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  function extractKeys(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/(\w+):\s*['"`]/g) || [];
    return matches.map(m => m.split(':')[0].trim()).sort();
  }

  test('Translation keys match 1:1 across all locales', () => {
    const enKeys = extractKeys(path.join(localesDir, 'en-US.ts'));
    expect(enKeys.length).toBeGreaterThan(10);

    localeFiles.slice(1).forEach(file => {
      const targetKeys = extractKeys(path.join(localesDir, file));
      expect(targetKeys).toEqual(enKeys);
    });
  });
});
