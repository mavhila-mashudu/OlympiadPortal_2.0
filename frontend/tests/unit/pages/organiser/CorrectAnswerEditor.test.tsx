import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../../../../src/lib/questions';
import { CorrectAnswerEditor } from '../../../../src/pages/organiser/CorrectAnswerEditor';

const question = (overrides: Partial<Question> = {}): Question => ({
    id: 'q1',
    type: 'mcq',
    prompt: 'Which are prime?',
    options: ['2', '4', '5'],
    correct_option: '1',
    correct_answer: null,
    negative_pct: 0,
    max_points: 3,
    ...overrides,
});

const setup = (q: Question, saving = false) => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
        <CorrectAnswerEditor
            question={q}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
        />
    );
    return { onSave, onCancel, user: userEvent.setup() };
};

const saveButton = () =>
    screen.getByRole('button', { name: /save correction|saving/i });

describe('CorrectAnswerEditor', () => {
    it('lets the organiser tick several correct options on a multiple-choice question', async () => {
        const { user, onSave } = setup(question({ correct_option: '1' }));

        expect(screen.getByRole('checkbox', { name: 'B. 4' })).toBeChecked();
        await user.click(screen.getByRole('checkbox', { name: 'B. 4' }));
        await user.click(screen.getByRole('checkbox', { name: 'A. 2' }));
        await user.click(screen.getByRole('checkbox', { name: 'C. 5' }));
        await user.click(saveButton());

        expect(onSave).toHaveBeenCalledWith({
            correct_option: '0,2',
            correct_answer: null,
        });
    });

    it('allows only one answer on a True/False question', async () => {
        const { user, onSave } = setup(
            question({
                type: 'true_false',
                options: ['True', 'False'],
                correct_option: '0',
            })
        );

        expect(screen.getAllByRole('radio')).toHaveLength(2);
        await user.click(screen.getByRole('radio', { name: 'B. False' }));
        expect(
            screen.getByRole('radio', { name: 'A. True' })
        ).not.toBeChecked();
        await user.click(saveButton());

        expect(onSave).toHaveBeenCalledWith({
            correct_option: '1',
            correct_answer: null,
        });
    });

    it("won't save a choice question with no correct option", async () => {
        const { user } = setup(question({ correct_option: '1' }));
        await user.click(screen.getByRole('checkbox', { name: 'B. 4' }));
        expect(saveButton()).toBeDisabled();
    });

    it('edits the expected short answer, trimmed', async () => {
        const { user, onSave } = setup(
            question({
                type: 'short_answer',
                options: null,
                correct_option: null,
                correct_answer: 'Joburg',
            })
        );

        const input = screen.getByPlaceholderText('Expected answer');
        expect(input).toHaveValue('Joburg');
        await user.clear(input);
        expect(saveButton()).toBeDisabled();

        await user.type(input, '  Pretoria ');
        await user.click(saveButton());
        expect(onSave).toHaveBeenCalledWith({
            correct_option: null,
            correct_answer: 'Pretoria',
        });
    });

    it('explains that essays have no reference answer and can still be confirmed', async () => {
        const { user, onSave } = setup(
            question({ type: 'essay', options: null, correct_option: null })
        );

        expect(
            screen.getByText(/essays have no reference answer/i)
        ).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        await user.click(saveButton());
        expect(onSave).toHaveBeenCalledWith({
            correct_option: null,
            correct_answer: null,
        });
    });

    it('disables both buttons while saving', () => {
        setup(question(), true);
        expect(saveButton()).toHaveTextContent('Saving...');
        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('cancels without saving', async () => {
        const { user, onSave, onCancel } = setup(question());
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});
