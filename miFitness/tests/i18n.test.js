import test from 'node:test';
import assert from 'node:assert';

import {
    catalogs, t, tn, tGroup, tEquipment, seedName, seedDescription,
    setLocale, getLocale, LOCALES, LOCALE_NAMES
} from '../js/i18n.js';
import { MUSCLE_GROUPS, EQUIPMENT_TYPES, SEED_EXERCISE_NAMES, SEED_ROUTINE_NAMES, SEED_ROUTINE_DESCRIPTIONS } from '../js/db.js';

/** Keys for seeded row names live only in the non-English catalogs. */
const isSeedKey = (key) => key.startsWith('seed.') || key.startsWith('seedDesc.');
const uiKeys = (locale) => Object.keys(catalogs[locale]).filter((key) => !isSeedKey(key));

const placeholders = (entry) => {
    const text = typeof entry === 'string' ? entry : Object.values(entry).join(' ');
    return new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
};

test.afterEach(() => setLocale('en'));

test('every UI string exists in both catalogs', () => {
    assert.deepStrictEqual(LOCALES, ['en', 'fr']);
    const english = uiKeys('en');
    assert.ok(english.length > 200, 'the catalog should cover the whole interface');
    assert.deepStrictEqual(uiKeys('fr').sort(), english.sort());
});

test('every language offered has a name written in that language', () => {
    for (const locale of LOCALES) assert.ok(LOCALE_NAMES[locale], `${locale} needs a display name`);
    assert.strictEqual(LOCALE_NAMES.fr, 'Français');
});

test('translations use exactly the placeholders their English original does', () => {
    // This is what catches "{sets} enregistrées" when the English took {count}.
    for (const key of uiKeys('en')) {
        assert.deepStrictEqual(
            [...placeholders(catalogs.fr[key])].sort(),
            [...placeholders(catalogs.en[key])].sort(),
            `placeholders differ for ${key}`
        );
    }
});

test('plural entries carry every form their locale needs', () => {
    for (const locale of LOCALES) {
        for (const [key, entry] of Object.entries(catalogs[locale])) {
            if (typeof entry === 'string') continue;
            assert.ok(entry.other, `${locale} ${key} needs an "other" form`);
            assert.ok(entry.one, `${locale} ${key} needs a "one" form`);
        }
    }
});

test('no translation is left as its English original by accident', () => {
    // Proper nouns and symbols legitimately match; prose should not.
    const shared = uiKeys('en').filter((key) => {
        const [a, b] = [catalogs.en[key], catalogs.fr[key]];
        return typeof a === 'string' && a === b && /\s\w+\s/.test(a);
    });
    assert.deepStrictEqual(shared, [], 'these look untranslated');
});

test('every muscle group and equipment type is translated', () => {
    for (const group of MUSCLE_GROUPS) {
        for (const locale of LOCALES) {
            assert.ok(catalogs[locale][`group.${group}`], `${locale} is missing group.${group}`);
        }
    }
    for (const equipment of EQUIPMENT_TYPES) {
        for (const locale of LOCALES) {
            assert.ok(catalogs[locale][`equipment.${equipment}`], `${locale} is missing equipment.${equipment}`);
        }
    }

    setLocale('fr');
    assert.strictEqual(tGroup('Chest'), 'Pectoraux');
    assert.strictEqual(tEquipment('Cable'), 'Poulie');
    assert.strictEqual(tGroup(''), '', 'a missing group renders as nothing');
    assert.strictEqual(tGroup('Invented'), 'group.Invented', 'an unknown key is visible, not blank');
});

test('every seeded exercise and routine has a French name', () => {
    for (const id of Object.keys(SEED_EXERCISE_NAMES)) {
        assert.ok(catalogs.fr[`seed.${id}`], `French name missing for ${id}`);
    }
    for (const id of Object.keys(SEED_ROUTINE_NAMES)) {
        assert.ok(catalogs.fr[`seed.${id}`], `French name missing for routine ${id}`);
        assert.ok(catalogs.fr[`seedDesc.${id}`], `French description missing for routine ${id}`);
    }
    assert.strictEqual(Object.keys(SEED_EXERCISE_NAMES).length, 38);
    assert.strictEqual(Object.keys(SEED_ROUTINE_DESCRIPTIONS).length, 3);
});

test('interpolation fills placeholders and leaves unknown keys visible', () => {
    assert.strictEqual(t('workout.removeConfirm', { name: 'Leg Press' }), 'Remove Leg Press?');
    assert.strictEqual(t('workout.removeConfirm'), 'Remove {name}?', 'a missing param stays literal');
    assert.strictEqual(t('nope.not.a.key'), 'nope.not.a.key');
});

test('plural selection follows each locale, not English', () => {
    setLocale('en');
    assert.strictEqual(tn('common.sets', 0), '0 sets');
    assert.strictEqual(tn('common.sets', 1), '1 set');
    assert.strictEqual(tn('common.sets', 2), '2 sets');

    setLocale('fr');
    assert.strictEqual(tn('common.sets', 0), '0 série', 'French treats zero as singular');
    assert.strictEqual(tn('common.sets', 1), '1 série');
    assert.strictEqual(tn('common.sets', 2), '2 séries');
});

test('a sentence built around a count agrees in both languages', () => {
    setLocale('en');
    assert.match(t('home.subReady', { count: 1, volume: '600', unit: 'kg' }), /^1 workout logged/);
    assert.match(t('home.subReady', { count: 4, volume: '600', unit: 'kg' }), /^4 workouts logged/);

    setLocale('fr');
    assert.match(t('home.subReady', { count: 1, volume: '600', unit: 'kg' }), /^1 séance enregistrée/);
    assert.match(t('home.subReady', { count: 4, volume: '600', unit: 'kg' }), /^4 séances enregistrées/);
});

test('setLocale rejects a locale we have no catalog for', () => {
    assert.strictEqual(setLocale('de'), 'en');
    assert.strictEqual(getLocale(), 'en');
    assert.strictEqual(setLocale('fr'), 'fr');
});

test('seeded names translate only while the seed text is untouched', () => {
    const id = 'flat-barbell-bench-press';
    const stored = SEED_EXERCISE_NAMES[id];

    setLocale('en');
    assert.strictEqual(seedName(id, stored, SEED_EXERCISE_NAMES), stored, 'English shows the stored name');

    setLocale('fr');
    assert.strictEqual(seedName(id, stored, SEED_EXERCISE_NAMES), 'Développé couché à la barre');
    assert.strictEqual(
        seedName(id, 'My Bench Variation', SEED_EXERCISE_NAMES), 'My Bench Variation',
        'a rename wins over the translation'
    );
    assert.strictEqual(
        seedName('3f9c-custom-uuid', 'Zercher Squat', SEED_EXERCISE_NAMES), 'Zercher Squat',
        'a custom exercise is never translated'
    );
    assert.strictEqual(seedName(null, 'Something', SEED_EXERCISE_NAMES), 'Something');
});

test('starter routines translate their name and description together', () => {
    setLocale('fr');
    const id = 'routine-push';
    assert.strictEqual(seedName(id, SEED_ROUTINE_NAMES[id], SEED_ROUTINE_NAMES), 'Séance Poussée');
    assert.strictEqual(
        seedDescription(id, SEED_ROUTINE_DESCRIPTIONS[id], SEED_ROUTINE_DESCRIPTIONS),
        'Pectoraux, épaules et triceps.'
    );
    assert.strictEqual(seedDescription(id, '', SEED_ROUTINE_DESCRIPTIONS), '', 'an empty description stays empty');
});
