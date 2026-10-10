import { describe, expect, it } from 'vitest';
import {
    TYPE_LABELS,
    perCorrectPoints,
    splitCorrect,
    type Question,
} from '../../../src/lib/questions';

const question = (overrides: Partial<Question> = {}): Question => ({
    id: 'q1',
    type: 'mcq',
    prompt: 'Pick',
    options: ['a', 'b', 'c'],
    correct_option: '0',
    correct_answer: null,
    negative_pct: 0,
    max_points: 6,
    ...overrides,
});

describe('TYPE_LABELS', () => {
    it('has a readable label for every question type', () => {
        expect(TYPE_LABELS).toEqual({
            mcq: 'Multiple choice',
            true_false: 'True / False',
            short_answer: 'Short answer',
            essay: 'Essay / long answer',
        });
    });
});

describe('splitCorrect', () => {
    it('splits and trims a comma-separated list of option indexes', () => {
        expect(splitCorrect('0, 2 ,3')).toEqual(['0', '2', '3']);
    });

    it('ignores empty entries', () => {
        expect(splitCorrect('1,,')).toEqual(['1']);
    });

    it.each([null, ''])('returns no indexes for %p', (value) => {
        expect(splitCorrect(value)).toEqual([]);
    });
});

describe('perCorrectPoints', () => {
    it('splits the marks evenly across the correct options', () => {
        expect(perCorrectPoints(question({ correct_option: '0,1,2' }))).toBe(2);
    });

    it('rounds to two decimal places', () => {
        expect(
            perCorrectPoints(
                question({ correct_option: '0,1,2', max_points: 1 })
            )
        ).toBe(0.33);
    });

    it('is 0 when no correct option is set', () => {
        expect(perCorrectPoints(question({ correct_option: null }))).toBe(0);
    });

    it('accepts max_points sent as a string by the API', () => {
        expect(
            perCorrectPoints(
                question({
                    correct_option: '0,1',
                    max_points: '5' as unknown as number,
                })
            )
        ).toBe(2.5);
    });
});
