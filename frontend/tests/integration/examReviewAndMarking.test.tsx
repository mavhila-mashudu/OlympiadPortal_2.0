import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Difficulty } from '../../src/lib/questions';
import * as fx from './support/fixtures';
import { mockApi, mockApiError } from './support/network';
import { renderApp } from './support/renderApp';

describe('organiser exam review', () => {
    const questions = () => [
        fx.question({
            id: 'q-1',
            prompt: 'Which of these are prime?',
            max_points: '2',
            correct_option: '0,2',
            negative_pct: '25',
        }),
        fx.question({
            id: 'q-2',
            type: 'true_false',
            prompt: 'Zero is even.',
            options: ['True', 'False'],
            correct_option: '0',
            max_points: '1',
        }),
        fx.question({
            id: 'q-3',
            type: 'short_answer',
            prompt: 'What is 7 × 8?',
            options: null,
            correct_option: null,
            correct_answer: '56',
            max_points: '3',
        }),
        fx.question({
            id: 'q-4',
            type: 'essay',
            prompt: 'Prove there are infinitely many primes.',
            options: null,
            correct_option: null,
            max_points: '10',
        }),
    ];

    // The review page loads questions, exam status and the memo link together
    const mockReview = ({ status = 'ready', memo = true } = {}) => {
        const state = {
            questions: questions(),
            status: fx.examStatus({
                exam_status: status,
                question_count: 4,
                paper_id: 'paper-1',
            }),
        };
        mockApi('get', '/rounds/round-1/questions', () => ({
            questions: state.questions,
        }));
        mockApi('get', '/rounds/round-1/exam-status', () => state.status);
        if (memo)
            mockApi('get', '/rounds/round-1/papers/preview', (req) => ({
                url: `https://storage.test/memo.pdf${req.search}`,
            }));
        else
            mockApiError(
                'get',
                '/rounds/round-1/papers/preview',
                404,
                'No paper uploaded for this round'
            );
        // A draft exam also offers the organiser's question bank
        mockApi('get', '/rounds/round-1/question-bank', { questions: [] });
        return state;
    };

    it("summarises the exam with numeric totals and shows each question's answer key", async () => {
        mockReview();
        renderApp('/organiser/rounds/round-1/review');

        // Points arrive as Decimal strings; they must be added, not concatenated
        expect(
            await screen.findByText('4 questions · 16 total points')
        ).toBeInTheDocument();
        expect(screen.getByText('Awaiting approval')).toBeInTheDocument();

        const card = (prompt: string) =>
            screen.getByText(prompt).parentElement!;
        const mcq = card('Which of these are prime?');
        expect(
            within(mcq).getByText('Multiple choice (multiple answers)')
        ).toBeInTheDocument();
        expect(within(mcq).getByText('2 pts')).toBeInTheDocument();
        expect(
            within(mcq).getByText(
                'Points split evenly across 2 correct answers (1 each).'
            )
        ).toBeInTheDocument();
        expect(
            within(mcq).getByText(/Negative marking: 25%/)
        ).toBeInTheDocument();
        expect(
            within(card('Zero is even.')).getByText('1 pt')
        ).toBeInTheDocument();
        expect(
            within(card('What is 7 × 8?')).getByText('56')
        ).toBeInTheDocument();
        expect(
            within(card('Prove there are infinitely many primes.')).getByText(
                /queued for manual marking/
            )
        ).toBeInTheDocument();
    });

    it('shows the memo beside the questions and can hide it', async () => {
        mockReview();
        const { user } = renderApp('/organiser/rounds/round-1/review');

        const memo = await screen.findByTitle('Memo');
        expect(memo).toHaveAttribute(
            'src',
            'https://storage.test/memo.pdf?type=memo'
        );
        await user.click(screen.getByRole('button', { name: 'Hide memo' }));
        expect(screen.queryByTitle('Memo')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Show memo' })
        ).toBeInTheDocument();
    });

    it('works without a memo when none was uploaded', async () => {
        mockReview({ memo: false });
        renderApp('/organiser/rounds/round-1/review');

        expect(
            await screen.findByText('Which of these are prime?')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /memo/ })
        ).not.toBeInTheDocument();
    });

    it('approves the exam and shows who verified it', async () => {
        const state = mockReview();
        const patches = mockApi('patch', '/rounds/round-1/exam-status', () => {
            state.status = {
                ...state.status,
                exam_status: 'live',
                approved_by_name: 'Thandi Mokoena',
                approved_at: '2026-09-01T10:30:00.000Z',
            };
            return { round: { exam_status: 'live' } };
        });
        const { user } = renderApp('/organiser/rounds/round-1/review');

        await user.click(
            await screen.findByRole('button', { name: 'Approve & go live' })
        );

        expect(await screen.findByText('Approved — live')).toBeInTheDocument();
        expect(screen.getByText('Thandi Mokoena')).toBeInTheDocument();
        expect(
            screen.getByText(/This exam has been verified and is live/)
        ).toHaveTextContent(/Verified by Thandi Mokoena on 01 Sept 2026/);
        expect(patches[0].body).toEqual({ status: 'live' });
        expect(
            screen.queryByRole('button', { name: 'Approve & go live' })
        ).not.toBeInTheDocument();
    });

    it('sends the exam back to the educator', async () => {
        mockReview();
        const patches = mockApi('patch', '/rounds/round-1/exam-status', {
            round: { exam_status: 'draft' },
        });
        const { user } = renderApp('/organiser/rounds/round-1/review');

        await user.click(
            await screen.findByRole('button', { name: 'Send back for edits' })
        );

        expect(
            await screen.findByText(
                /Waiting for the educator to mark this exam as ready/
            )
        ).toBeInTheDocument();
        expect(patches[0].body).toEqual({ status: 'draft' });
        expect(screen.queryByTitle('Correct answer')).not.toBeInTheDocument();
    });

    it('shows why approval was refused', async () => {
        mockReview();
        mockApiError(
            'patch',
            '/rounds/round-1/exam-status',
            400,
            'Exam has no questions'
        );
        const { user } = renderApp('/organiser/rounds/round-1/review');

        await user.click(
            await screen.findByRole('button', { name: 'Approve & go live' })
        );
        expect(
            await screen.findByText('Exam has no questions')
        ).toBeInTheDocument();
        expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    });

    it('corrects a multiple-choice answer key', async () => {
        mockReview();
        const patches = mockApi(
            'patch',
            '/rounds/round-1/questions/:questionId',
            (req) => ({
                question: { ...questions()[0], ...(req.body as object) },
            })
        );
        const { user } = renderApp('/organiser/rounds/round-1/review');

        const mcq = (await screen.findByText('Which of these are prime?'))
            .parentElement!;
        await user.click(within(mcq).getByTitle('Correct answer'));
        // Untick "A. 2", tick "B. 4"
        await user.click(within(mcq).getByLabelText('A. 2'));
        await user.click(within(mcq).getByLabelText('B. 4'));
        await user.click(
            within(mcq).getByRole('button', { name: 'Save correction' })
        );

        await waitFor(() =>
            expect(
                within(mcq).queryByText('Correct this answer')
            ).not.toBeInTheDocument()
        );
        expect(patches[0].path).toBe('/rounds/round-1/questions/q-1');
        expect(patches[0].body).toEqual({
            correct_option: '2,1',
            correct_answer: null,
        });
        const ticked = within(mcq)
            .getAllByRole('listitem')
            .filter((li) => li.querySelector('svg'));
        expect(ticked.map((li) => li.textContent)).toEqual(['B.4', 'C.5']);
    });

    it("corrects a short answer and won't save a blank one", async () => {
        mockReview();
        const patches = mockApi(
            'patch',
            '/rounds/round-1/questions/:questionId',
            (req) => ({
                question: { ...questions()[2], ...(req.body as object) },
            })
        );
        const { user } = renderApp('/organiser/rounds/round-1/review');

        const short = (await screen.findByText('What is 7 × 8?'))
            .parentElement!;
        await user.click(within(short).getByTitle('Correct answer'));
        const input = within(short).getByPlaceholderText('Expected answer');
        await user.clear(input);
        expect(
            within(short).getByRole('button', { name: 'Save correction' })
        ).toBeDisabled();
        await user.type(input, ' fifty-six ');
        await user.click(
            within(short).getByRole('button', { name: 'Save correction' })
        );

        expect(await within(short).findByText('fifty-six')).toBeInTheDocument();
        expect(patches[0].body).toEqual({
            correct_option: null,
            correct_answer: 'fifty-six',
        });
    });

    it("doesn't offer corrections once the exam is live", async () => {
        mockReview({ status: 'live' });
        renderApp('/organiser/rounds/round-1/review');

        expect(await screen.findByText('Approved — live')).toBeInTheDocument();
        expect(screen.queryByTitle('Correct answer')).not.toBeInTheDocument();
    });

    // GET /rounds/:id/question-bank: the organiser's questions from other rounds
    const bankQuestion = (overrides: Record<string, unknown>) => ({
        ...fx.question(overrides),
        source_round: { id: 'round-0', name: '2025 Heats' },
    });

    it('imports chosen questions from the bank into a draft exam', async () => {
        const state = mockReview({ status: 'draft' });
        const bank = [
            bankQuestion({
                id: 'bank-1',
                prompt: 'Name a prime between 10 and 20.',
            }),
            bankQuestion({
                id: 'bank-2',
                type: 'essay',
                prompt: 'Why is 1 not prime?',
            }),
        ];
        // Like the backend, the bank leaves out questions already on this paper
        const onPaper = new Set<string>();
        mockApi('get', '/rounds/round-1/question-bank', () => ({
            questions: bank.filter((q) => !onPaper.has(q.id)),
        }));
        const imports = mockApi(
            'post',
            '/rounds/round-1/question-bank/import',
            (req) => {
                const ids = (req.body as { question_ids: string[] })
                    .question_ids;
                ids.forEach((id) => onPaper.add(id));
                const copies = bank
                    .filter((q) => ids.includes(q.id))
                    .map((q) => fx.question({ ...q, id: `copy-${q.id}` }));
                state.questions = [...state.questions, ...copies];
                return { questions: copies };
            },
            { status: 201 }
        );
        const { user } = renderApp('/organiser/rounds/round-1/review');

        expect(
            await screen.findByRole('heading', { name: 'Question bank' })
        ).toBeInTheDocument();
        expect(
            screen.getByText('Multiple choice · 2025 Heats')
        ).toBeInTheDocument();
        await user.type(screen.getByLabelText('Search question bank'), 'why');
        expect(
            screen.queryByText('Name a prime between 10 and 20.')
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('checkbox', { name: /Why is 1 not prime\?/ })
        );
        await user.click(screen.getByRole('button', { name: 'Import 1' }));

        await waitFor(() => expect(imports).toHaveLength(1));
        expect(imports[0].body).toEqual({ question_ids: ['bank-2'] });
        // The copy joins the paper, and the question leaves the bank, so it
        // can't be picked for this paper again
        expect(await screen.findByText('Q5')).toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: /Why is 1 not prime\?/ })
        ).not.toBeInTheDocument();
        expect(screen.getByText('No questions match.')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Import selected' })
        ).toBeDisabled();
    });

    it('says why an import was refused', async () => {
        mockReview({ status: 'draft' });
        mockApi('get', '/rounds/round-1/question-bank', {
            questions: [
                bankQuestion({
                    id: 'bank-1',
                    prompt: 'Name a prime between 10 and 20.',
                }),
            ],
        });
        mockApiError(
            'post',
            '/rounds/round-1/question-bank/import',
            409,
            'One or more of these questions is already on this paper'
        );
        const { user } = renderApp('/organiser/rounds/round-1/review');

        await user.click(
            await screen.findByRole('checkbox', {
                name: /Name a prime between 10 and 20\./,
            })
        );
        await user.click(screen.getByRole('button', { name: 'Import 1' }));

        expect(
            await screen.findByText(
                'One or more of these questions is already on this paper'
            )
        ).toBeInTheDocument();
    });

    // A8: difficulty is 1 − average score ÷ max points over marked answers
    it('shows how hard each question proved once it has been answered', async () => {
        const state = mockReview({ status: 'live' });
        const [prime, zero, product, proof] = questions();
        const rated = <Q,>(question: Q, difficulty: Difficulty) => ({
            ...question,
            difficulty,
        });
        state.questions = [
            rated(prime, { value: 0.72, band: 'hard', answered: 43 }),
            rated(zero, { value: null, band: null, answered: 3 }),
            rated(product, { value: 0.1, band: 'easy', answered: 20 }),
            rated(proof, { value: null, band: null, answered: 0 }),
        ];
        renderApp('/organiser/rounds/round-1/review');

        await screen.findByText('Which of these are prime?');
        const card = (prompt: string) =>
            screen.getByText(prompt).parentElement!;
        expect(
            within(card('Which of these are prime?')).getByText(
                'Hard · 28% average · 43 answers'
            )
        ).toBeInTheDocument();
        expect(
            within(card('Zero is even.')).getByText(
                'Not enough answers yet · 3 answers'
            )
        ).toBeInTheDocument();
        expect(
            within(card('What is 7 × 8?')).getByText(
                'Easy · 90% average · 20 answers'
            )
        ).toBeInTheDocument();
        // Nobody has answered it, so nothing is shown
        expect(
            within(card('Prove there are infinitely many primes.')).queryByText(
                /average|answers/
            )
        ).not.toBeInTheDocument();
    });

    it('filters the bank by difficulty and says where each question was used', async () => {
        mockReview({ status: 'draft' });
        mockApi('get', '/rounds/round-1/question-bank', {
            questions: [
                bankQuestion({
                    id: 'bank-easy',
                    prompt: 'Is 2 prime?',
                    used_in: [
                        { id: 'round-0', name: '2025 Heats' },
                        { id: 'round-00', name: '2025 Final' },
                    ],
                    difficulty: { value: 0.15, band: 'easy', answered: 60 },
                }),
                bankQuestion({
                    id: 'bank-hard',
                    prompt: "Prove Fermat's little theorem.",
                    difficulty: { value: 0.9, band: 'hard', answered: 12 },
                }),
                bankQuestion({
                    id: 'bank-new',
                    prompt: 'Is 91 prime?',
                    difficulty: { value: null, band: null, answered: 0 },
                }),
            ],
        });
        const { user } = renderApp('/organiser/rounds/round-1/review');

        expect(
            await screen.findByText(
                'Multiple choice · 2025 Heats · used in 2 rounds'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByText('Easy · 85% average · 60 answers')
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Hard' }));
        expect(screen.getByRole('button', { name: 'Hard' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(
            screen.getByText("Prove Fermat's little theorem.")
        ).toBeInTheDocument();
        expect(screen.queryByText('Is 2 prime?')).not.toBeInTheDocument();
        // A question with no difficulty yet only shows under All
        expect(screen.queryByText('Is 91 prime?')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Medium' }));
        expect(screen.getByText('No questions match.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'All' }));
        expect(screen.getByText('Is 91 prime?')).toBeInTheDocument();
    });

    it('only offers the bank while the exam is a draft', async () => {
        mockReview({ status: 'ready' });
        const bankCalls = mockApi('get', '/rounds/round-1/question-bank', {
            questions: [bankQuestion({ id: 'bank-1' })],
        });
        renderApp('/organiser/rounds/round-1/review');

        expect(
            await screen.findByText('Awaiting approval')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Question bank' })
        ).not.toBeInTheDocument();
        expect(bankCalls).toHaveLength(0);
    });

    it("keeps the exam on screen when the bank can't be loaded", async () => {
        mockReview({ status: 'draft' });
        mockApiError(
            'get',
            '/rounds/round-1/question-bank',
            500,
            'Could not load the question bank'
        );
        renderApp('/organiser/rounds/round-1/review');

        expect(
            await screen.findByText('Could not load the question bank')
        ).toBeInTheDocument();
        expect(
            screen.getByText('4 questions · 16 total points')
        ).toBeInTheDocument();
        expect(
            screen.getByText('Which of these are prime?')
        ).toBeInTheDocument();
    });
});

describe('organiser marking queue', () => {
    // Besides the queue, the page loads the round's submissions (for the route
    // counts), the moderation sample and remark requests. They start empty;
    // tests about those panels register their own responses, which take
    // precedence over these.
    beforeEach(() => {
        mockApi('get', '/rounds/round-1/submissions', { submissions: [] });
        mockApi('get', '/rounds/round-1/review-sample', { sample: [] });
        mockApi('get', '/rounds/round-1/remarks', { remarks: [] });
    });

    type QueueAnswer = ReturnType<typeof essayAnswer>;
    type QueueSubmission = {
        id: string;
        round_id: string;
        received_at: string;
        is_late: boolean;
        entrants: { id: string; full_name: string; grade: string | null };
        answers: QueueAnswer[];
    };

    // GET /rounds/:id/marking-queue: queued submissions with their unmarked answers
    const essayAnswer = (id: string, value: string | null) => ({
        id,
        submission_id: 'sub',
        question_id: 'q-essay',
        answer_value: value,
        is_correct: null,
        points_awarded: null,
        marked_at: null,
        questions: {
            id: 'q-essay',
            prompt: 'Prove there are infinitely many primes.',
            type: 'essay',
            options: null as string[] | null,
            correct_option: null as string | null,
            correct_answer: null as string | null,
            max_points: '10',
        },
    });
    const queue = (): QueueSubmission[] => [
        {
            id: 'sub-1',
            round_id: 'round-1',
            received_at: '2026-09-01T09:00:00.000Z',
            is_late: false,
            entrants: { id: 'ent-1', full_name: 'Ayanda Khumalo', grade: '11' },
            answers: [
                essayAnswer(
                    'ans-1',
                    'Assume finitely many and multiply them...'
                ),
                {
                    ...essayAnswer('ans-2', '4'),
                    question_id: 'q-mcq',
                    questions: {
                        id: 'q-mcq',
                        prompt: 'Pick the primes',
                        type: 'mcq',
                        options: ['2', '4', '5'],
                        correct_option: '0,2',
                        correct_answer: null,
                        max_points: '2',
                    },
                },
            ],
        },
        {
            id: 'sub-2',
            round_id: 'round-1',
            received_at: '2026-09-01T11:00:00.000Z',
            is_late: true,
            entrants: { id: 'ent-2', full_name: 'Lerato Nkosi', grade: null },
            answers: [essayAnswer('ans-3', '   ')],
        },
    ];

    it("lists each submission's answers with the memo answer", async () => {
        mockApi('get', '/rounds/round-1/marking-queue', {
            submissions: queue(),
        });
        renderApp('/organiser/rounds/round-1/marking');

        expect(
            await screen.findByText('awaiting marking across', { exact: false })
        ).toHaveTextContent('3 answers awaiting marking across 2 submissions');
        const ayanda = screen
            .getByRole('heading', { name: 'Ayanda Khumalo' })
            .closest('section')!;
        expect(within(ayanda).getByText('Grade 11')).toBeInTheDocument();
        expect(within(ayanda).getByText('2 to mark')).toBeInTheDocument();
        expect(within(ayanda).getByText('out of 10')).toBeInTheDocument();
        expect(
            within(ayanda).getByText('Memo answer').nextElementSibling
        ).toHaveTextContent('2, 5');

        const lerato = screen
            .getByRole('heading', { name: 'Lerato Nkosi' })
            .closest('section')!;
        expect(within(lerato).getByText('Late')).toBeInTheDocument();
        expect(
            within(lerato).getByText('No answer provided')
        ).toBeInTheDocument();
    });

    it('awards a mark, then reloads the queue without the marked answer', async () => {
        let submissions = queue();
        mockApi('get', '/rounds/round-1/marking-queue', () => ({
            submissions,
        }));
        const marks = mockApi(
            'patch',
            '/rounds/round-1/answers/:answerId',
            (req) => {
                const answerId = req.path.split('/').pop();
                submissions = submissions
                    .map((s) => ({
                        ...s,
                        answers: s.answers.filter((a) => a.id !== answerId),
                    }))
                    .filter((s) => s.answers.length > 0);
                return { answer: { id: answerId } };
            }
        );
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        await screen.findByText('Assume finitely many and multiply them...');
        const answerCard = screen
            .getByText('Assume finitely many and multiply them...')
            .closest('div')!.parentElement!;
        const points = within(answerCard).getByRole('spinbutton');
        expect(points).toHaveValue(10);
        await user.clear(points);
        await user.type(points, '7.5');
        await user.click(
            within(answerCard).getByRole('button', { name: 'Award' })
        );

        await waitFor(() =>
            expect(
                screen.queryByText('Assume finitely many and multiply them...')
            ).not.toBeInTheDocument()
        );
        expect(marks[0]).toMatchObject({
            path: '/rounds/round-1/answers/ans-1',
            body: { is_correct: true, points_awarded: 7.5 },
        });
        expect(
            screen.getByText('awaiting marking across', { exact: false })
        ).toHaveTextContent('2 answers awaiting marking across 2 submissions');
    });

    it("caps a typed mark at the question's points and supports Zero", async () => {
        mockApi('get', '/rounds/round-1/marking-queue', {
            submissions: [queue()[1]],
        });
        const marks = mockApi('patch', '/rounds/round-1/answers/:answerId', {
            answer: {},
        });
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        const points = await screen.findByRole('spinbutton');
        await user.clear(points);
        await user.type(points, '15');
        expect(points).toHaveValue(10);
        await user.click(screen.getByRole('button', { name: 'Zero' }));

        await waitFor(() => expect(marks).toHaveLength(1));
        expect(marks[0].body).toEqual({ is_correct: false, points_awarded: 0 });
    });

    it('keeps the answer open and shows the error when a mark is rejected', async () => {
        mockApi('get', '/rounds/round-1/marking-queue', {
            submissions: [queue()[1]],
        });
        mockApiError(
            'patch',
            '/rounds/round-1/answers/:answerId',
            400,
            'points_awarded cannot exceed max_points'
        );
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        await user.click(await screen.findByRole('button', { name: 'Full' }));

        expect(
            await screen.findByText('points_awarded cannot exceed max_points')
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Award' })).toBeEnabled();
    });

    it('generates results once nothing is left to mark', async () => {
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        const generated = mockApi('post', '/rounds/round-1/results', {
            results: 42,
        });
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        expect(
            await screen.findByRole('heading', { name: 'Nothing to mark' })
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Generate results' })
        );

        expect(
            await screen.findByRole('heading', { name: 'Results released' })
        ).toBeInTheDocument();
        expect(generated).toHaveLength(1);
    });

    it("shows why results couldn't be generated", async () => {
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        mockApiError(
            'post',
            '/rounds/round-1/results',
            400,
            'Round must be closed before generating results'
        );
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        await user.click(
            await screen.findByRole('button', { name: 'Generate results' })
        );
        expect(
            await screen.findByText(
                'Round must be closed before generating results'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Nothing to mark' })
        ).toBeInTheDocument();
    });

    it("shows an error when the queue can't be loaded", async () => {
        mockApiError(
            'get',
            '/rounds/round-1/marking-queue',
            403,
            'Not authorised for this round'
        );
        renderApp('/organiser/rounds/round-1/marking');
        expect(
            await screen.findByText('Not authorised for this round')
        ).toBeInTheDocument();
    });

    it("counts the round's submissions by sitting route, and the late ones", async () => {
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        mockApi('get', '/rounds/round-1/submissions', {
            submissions: [
                { id: 's-1', route: 'online', is_late: false },
                { id: 's-2', route: 'online', is_late: true },
                { id: 's-3', route: 'offline', is_late: false },
            ],
        });
        renderApp('/organiser/rounds/round-1/marking');

        await screen.findByRole('heading', {
            name: 'One paper, two sitting routes',
        });
        expect(screen.getByText('online').parentElement).toHaveTextContent(
            '2 online'
        );
        expect(screen.getByText('paper').parentElement).toHaveTextContent(
            '1 paper'
        );
        expect(screen.getByText('late').parentElement).toHaveTextContent(
            '1 late'
        );
    });

    // The queue is the point of the page; the side panels failing mustn't hide it
    it("still shows the queue when the moderation sample can't be loaded", async () => {
        mockApi('get', '/rounds/round-1/marking-queue', {
            submissions: queue(),
        });
        mockApiError(
            'get',
            '/rounds/round-1/review-sample',
            500,
            'Could not load the moderation sample'
        );
        renderApp('/organiser/rounds/round-1/marking');

        expect(
            await screen.findByText('Could not load the moderation sample')
        ).toBeInTheDocument();
        expect(
            screen.getByText('awaiting marking across', { exact: false })
        ).toHaveTextContent('3 answers awaiting marking across 2 submissions');
    });

    it('saves a moderation review of a sampled answer and reloads', async () => {
        let reviews: { id: string }[] = [];
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        mockApi('get', '/rounds/round-1/review-sample', () => ({
            sample: [
                {
                    id: 'ans-7',
                    answer_value: "Euclid's argument, written out",
                    points_awarded: '6',
                    questions: {
                        prompt: 'Prove there are infinitely many primes.',
                        max_points: '10',
                    },
                    submissions: { entrants: { full_name: 'Ayanda Khumalo' } },
                    marking_reviews: reviews,
                },
            ],
        }));
        const saved = mockApi(
            'patch',
            '/rounds/round-1/review-sample/:answerId',
            () => {
                reviews = [{ id: 'review-1' }];
                return { message: 'Review saved and results recalculated' };
            }
        );
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        expect(await screen.findByText('Ayanda Khumalo')).toBeInTheDocument();
        expect(
            screen.getByText(/Mark: 6\/10 \| Reviews: 0/)
        ).toBeInTheDocument();
        const points = screen.getByLabelText('Reviewed points');
        await user.clear(points);
        await user.type(points, '8');
        await user.type(
            screen.getByLabelText('Review comment'),
            'Marked too harshly'
        );
        await user.click(screen.getByRole('button', { name: 'Save review' }));

        expect(await screen.findByText(/Reviews: 1/)).toBeInTheDocument();
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            path: '/rounds/round-1/review-sample/ans-7',
            body: { points_awarded: 8, comment: 'Marked too harshly' },
        });
    });

    it("records a decision on a student's remark request", async () => {
        let status = 'pending';
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        mockApi('get', '/rounds/round-1/remarks', () => ({
            remarks: [
                {
                    id: 'remark-1',
                    status,
                    reason: 'My proof was complete but got half marks',
                    decision:
                        status === 'pending' ? null : 'The proof was complete',
                    entrants: {
                        full_name: 'Lerato Nkosi',
                        submissions: [
                            {
                                id: 'sub-2',
                                answers: [
                                    {
                                        id: 'ans-9',
                                        answer_value: '...',
                                        points_awarded: '5',
                                        questions: {
                                            prompt: 'Prove there are infinitely many primes.',
                                            max_points: '10',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            ],
        }));
        const decisions = mockApi(
            'post',
            '/remarks/:remarkId/decision',
            () => {
                status = 'approved';
                return { remark: { id: 'remark-1', status } };
            }
        );
        const { user } = renderApp('/organiser/rounds/round-1/marking');

        expect(
            await screen.findByText(/pending: My proof was complete/)
        ).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Decision'), 'approved');
        await user.selectOptions(screen.getByLabelText('Answer'), 'ans-9');
        await user.type(screen.getByLabelText('Revised points'), '8');
        await user.type(
            screen.getByLabelText('Explanation'),
            'The proof was complete'
        );
        await user.click(
            screen.getByRole('button', { name: 'Record decision' })
        );

        expect(
            await screen.findByText('Decision: The proof was complete')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Record decision' })
        ).not.toBeInTheDocument();
        expect(decisions[0]).toMatchObject({
            path: '/remarks/remark-1/decision',
            body: {
                status: 'approved',
                answer_id: 'ans-9',
                points_awarded: 8,
                decision: 'The proof was complete',
            },
        });
    });
});
