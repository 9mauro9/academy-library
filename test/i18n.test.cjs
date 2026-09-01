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
    const eqIdx = content.indexOf('= {');
    const jsonStr = content.substring(eqIdx + 2, content.lastIndexOf('}') + 1);
    const obj = JSON.parse(jsonStr);
    function getDeepKeys(o, prefix = '') {
      return Object.keys(o).reduce((res, el) => {
        if (typeof o[el] === 'object' && o[el] !== null) {
          return [...res, ...getDeepKeys(o[el], prefix + el + '.')];
        }
        return [...res, prefix + el];
      }, []);
    }
    return getDeepKeys(obj).sort();
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
