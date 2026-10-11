import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as fx from './support/fixtures';
import { mockApi, mockApiError } from './support/network';
import { renderApp } from './support/renderApp';

const PATH = '/educator/rounds/round-1/exam';

// Stateful fake of the question endpoints: POST/PATCH/DELETE change what the
// next GET returns, and saved questions come back with Decimal strings
const mockBuilder = ({
    questions = [] as ReturnType<typeof fx.question>[],
    status = 'draft',
    paper = true,
} = {}) => {
    const state = { questions, status };
    const asRow = (body: Record<string, unknown>, id: string) =>
        fx.question({
            ...body,
            id,
            max_points: String(body.max_points),
            negative_pct: String(body.negative_pct ?? 0),
        });

    mockApi('get', '/rounds/round-1/questions', () => ({
        questions: state.questions,
    }));
    mockApi('get', '/rounds/round-1/exam/status', () =>
        fx.examStatus({
            exam_status: state.status,
            question_count: state.questions.length,
        })
    );
    if (paper)
        mockApi('get', '/rounds/round-1/papers/preview', (req) => ({
            url: `https://storage.test/paper.pdf${req.search}`,
        }));
    else
        mockApiError(
            'get',
            '/rounds/round-1/papers/preview',
            404,
            'No paper uploaded for this round'
        );

    const created = mockApi(
        'post',
        '/rounds/round-1/questions',
        (req) => {
            const question = asRow(
                req.body as Record<string, unknown>,
                `q-new-${state.questions.length + 1}`
            );
            state.questions = [...state.questions, question];
            return { question };
        },
        { status: 201 }
    );
    const updated = mockApi(
        'patch',
        '/rounds/round-1/questions/:questionId',
        (req) => {
            const questionId = req.path.split('/').pop()!;
            const question = asRow(
                req.body as Record<string, unknown>,
                questionId
            );
            state.questions = state.questions.map((q) =>
                q.id === questionId ? question : q
            );
            return { question };
        }
    );
    const deleted = mockApi(
        'delete',
        '/rounds/round-1/questions/:questionId',
        (req) => {
            state.questions = state.questions.filter(
                (q) => q.id !== req.path.split('/').pop()
            );
            return { deleted: true };
        }
    );
    const statusChanges = mockApi(
        'patch',
        '/rounds/round-1/exam/status',
        (req) => {
            state.status = (req.body as { status: string }).status;
            return { round: { exam_status: state.status } };
        }
    );
    return { state, created, updated, deleted, statusChanges };
};

const statusBar = () => screen.getByText(/total point/).parentElement!;

// Clearing a number field and typing must replace its value, not append to it
const replaceValue = async (
    user: ReturnType<typeof renderApp>['user'],
    input: HTMLElement,
    value: string
) => {
    await user.clear(input);
    await user.type(input, value);
};

describe('educator exam builder', () => {
    it('shows the uploaded question paper beside the builder', async () => {
        mockBuilder();
        const { user } = renderApp(PATH);

        expect(await screen.findByTitle('Question paper')).toHaveAttribute(
            'src',
            'https://storage.test/paper.pdf?type=paper'
        );
        await user.click(
            screen.getByRole('button', { name: 'Hide question paper' })
        );
        expect(screen.queryByTitle('Question paper')).not.toBeInTheDocument();
    });

    it('adds a multi-answer multiple-choice question, skipping blank options', async () => {
        const { created } = mockBuilder({ paper: false });
        const { user } = renderApp(PATH);

        await user.click(
            await screen.findByRole('button', { name: 'Add question' })
        );
        expect(
            screen.getByRole('heading', { name: 'Add a question' })
        ).toBeInTheDocument();
        const save = screen.getByRole('button', { name: 'Add question' });
        expect(save).toBeDisabled();

        await user.type(
            screen.getByLabelText('Question prompt'),
            'Which numbers are prime?'
        );
        await user.type(screen.getByPlaceholderText('Option 1'), '2');
        // Option 2 is left blank, so option 3 becomes the second saved option
        await user.type(screen.getByPlaceholderText('Option 3'), '5');
        await user.type(screen.getByPlaceholderText('Option 4'), '9');
        const ticks = screen.getAllByTitle('Mark as correct');
        await user.click(ticks[0]);
        await user.click(ticks[2]);
        await user.clear(screen.getByLabelText(/Negative marking/));
        await user.type(screen.getByLabelText(/Negative marking/), '50');
        await replaceValue(user, screen.getByLabelText('Points'), '4');
        await user.click(save);

        const card = (await screen.findByText('Which numbers are prime?'))
            .parentElement!;
        expect(created[0].body).toEqual({
            type: 'mcq',
            prompt: 'Which numbers are prime?',
            options: ['2', '5', '9'],
            correct_option: '0,1',
            correct_answer: null,
            negative_pct: 50,
            max_points: 4,
        });
        expect(
            within(card).getByText('Multiple choice (multiple answers)')
        ).toBeInTheDocument();
        expect(within(card).getByText('4 pts')).toBeInTheDocument();
        expect(
            within(card).getByText('Negative marking: -50% per wrong selection')
        ).toBeInTheDocument();
        expect(statusBar()).toHaveTextContent('1 question4 total pointsDraft');
    });

    it('adds true/false, short-answer and essay questions and totals their points', async () => {
        const { created } = mockBuilder({ paper: false });
        const { user } = renderApp(PATH);

        const addQuestion = async (fill: () => Promise<void>) => {
            await user.click(
                await screen.findByRole('button', { name: 'Add question' })
            );
            await fill();
            await user.click(
                screen.getByRole('button', { name: 'Add question' })
            );
            await waitFor(() =>
                expect(
                    screen.queryByRole('heading', { name: 'Add a question' })
                ).not.toBeInTheDocument()
            );
        };

        await addQuestion(async () => {
            await user.selectOptions(
                screen.getByLabelText('Question type'),
                'true_false'
            );
            await user.type(
                screen.getByLabelText('Question prompt'),
                'Zero is even.'
            );
            await user.click(screen.getByLabelText('True'));
        });
        await addQuestion(async () => {
            await user.selectOptions(
                screen.getByLabelText('Question type'),
                'short_answer'
            );
            await user.type(
                screen.getByLabelText('Question prompt'),
                'What is 7 × 8?'
            );
            await user.type(screen.getByLabelText('Correct answer'), '  56 ');
            await replaceValue(user, screen.getByLabelText('Points'), '2');
        });
        await addQuestion(async () => {
            await user.selectOptions(
                screen.getByLabelText('Question type'),
                'essay'
            );
            await user.type(
                screen.getByLabelText('Question prompt'),
                'Prove it.'
            );
            await replaceValue(user, screen.getByLabelText('Points'), '10');
        });

        expect(created.map((c) => c.body)).toEqual([
            {
                type: 'true_false',
                prompt: 'Zero is even.',
                options: ['True', 'False'],
                correct_option: '0',
                correct_answer: null,
                negative_pct: 0,
                max_points: 1,
            },
            {
                type: 'short_answer',
                prompt: 'What is 7 × 8?',
                options: null,
                correct_option: null,
                correct_answer: '56',
                negative_pct: 0,
                max_points: 2,
            },
            {
                type: 'essay',
                prompt: 'Prove it.',
                options: null,
                correct_option: null,
                correct_answer: null,
                negative_pct: 0,
                max_points: 10,
            },
        ]);
        // "1" + "2" + "10" from the API must total 13, not "0" + "1" + "2" + "10"
        expect(statusBar()).toHaveTextContent('3 questions13 total points');
        expect(
            within(screen.getByText('Zero is even.').parentElement!).getByText(
                '1 pt'
            )
        ).toBeInTheDocument();
        expect(screen.getByText('Marked manually')).toBeInTheDocument();
    });

    it('edits an existing question with its saved values pre-filled', async () => {
        const { updated } = mockBuilder({
            paper: false,
            questions: [
                fx.question({
                    id: 'q-1',
                    type: 'short_answer',
                    prompt: 'What is 6 × 7?',
                    options: null,
                    correct_option: null,
                    correct_answer: '42',
                    max_points: '3',
                }),
            ],
        });
        const { user } = renderApp(PATH);

        await user.click(await screen.findByTitle('Edit'));
        expect(
            screen.getByRole('heading', { name: 'Edit question' })
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Question prompt')).toHaveValue(
            'What is 6 × 7?'
        );
        expect(screen.getByLabelText('Points')).toHaveValue(3);
        await user.clear(screen.getByLabelText('Correct answer'));
        await user.type(screen.getByLabelText('Correct answer'), 'forty-two');
        await user.click(
            screen.getByRole('button', { name: 'Update question' })
        );

        expect(await screen.findByText('forty-two')).toBeInTheDocument();
        expect(updated[0].path).toBe('/rounds/round-1/questions/q-1');
        // Unchanged Decimal points are sent back as a number
        expect(updated[0].body).toMatchObject({
            correct_answer: 'forty-two',
            max_points: 3,
        });
    });

    it('deletes a question after confirmation', async () => {
        const { deleted } = mockBuilder({
            paper: false,
            questions: [fx.question({ id: 'q-1', prompt: 'Delete me' })],
        });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { user } = renderApp(PATH);

        await user.click(await screen.findByTitle('Delete'));

        await waitFor(() =>
            expect(screen.queryByText('Delete me')).not.toBeInTheDocument()
        );
        expect(deleted[0].path).toBe('/rounds/round-1/questions/q-1');
        expect(statusBar()).toHaveTextContent('0 questions0 total points');
    });

    it("keeps the form open with the backend's error when a save fails", async () => {
        mockBuilder({ paper: false });
        mockApiError(
            'post',
            '/rounds/round-1/questions',
            400,
            'Questions can only be edited while the exam is in draft'
        );
        const { user } = renderApp(PATH);

        await user.click(
            await screen.findByRole('button', { name: 'Add question' })
        );
        await user.selectOptions(
            screen.getByLabelText('Question type'),
            'essay'
        );
        await user.type(screen.getByLabelText('Question prompt'), 'Prove it.');
        await user.click(screen.getByRole('button', { name: 'Add question' }));

        expect(
            await screen.findByText(
                'Questions can only be edited while the exam is in draft'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Add a question' })
        ).toBeInTheDocument();
    });

    it('submits the exam for organiser review and locks adding questions', async () => {
        const { statusChanges } = mockBuilder({
            paper: false,
            questions: [fx.question({ id: 'q-1' })],
        });
        const { user } = renderApp(PATH);

        await user.click(
            await screen.findByRole('button', {
                name: 'Mark as ready for review',
            })
        );

        expect(
            await screen.findByText(
                'Submitted for organiser verification. Waiting for approval.'
            )
        ).toBeInTheDocument();
        expect(statusChanges[0].body).toEqual({ status: 'ready' });
        expect(
            screen.queryByRole('button', { name: 'Add question' })
        ).not.toBeInTheDocument();
    });

    it('only offers submission once the exam has questions', async () => {
        mockBuilder({ paper: false });
        renderApp(PATH);
        await screen.findByRole('button', { name: 'Add question' });
        expect(
            screen.queryByRole('button', { name: 'Mark as ready for review' })
        ).not.toBeInTheDocument();
    });
});
