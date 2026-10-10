import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    ErrorAlert,
    LoadingIndicator,
} from '../../../../src/components/ui/Feedback';
import { friendlyErrorMessage } from '../../../../src/lib/feedback';

describe('ErrorAlert', () => {
    it('announces a clear error and lets the user dismiss it', async () => {
        const user = userEvent.setup();
        const onDismiss = vi.fn();
        render(
            <ErrorAlert message="Please try again." onDismiss={onDismiss} />
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'We couldn’t complete that request'
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Please try again.'
        );
        await user.click(
            screen.getByRole('button', { name: 'Dismiss error message' })
        );
        expect(onDismiss).toHaveBeenCalledOnce();
    });
});

describe('LoadingIndicator', () => {
    it('exposes an accessible loading status', () => {
        render(<LoadingIndicator delay={0} label="Loading results" />);
        expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Loading results');
    });

    it('stays hidden for a quick load and appears only once it takes a while', () => {
        vi.useFakeTimers();
        try {
            render(<LoadingIndicator delay={800} label="Loading results" />);
            act(() => vi.advanceTimersByTime(799));
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            act(() => vi.advanceTimersByTime(1));
            expect(screen.getByRole('status')).toHaveTextContent(
                'Loading results'
            );
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('friendlyErrorMessage', () => {
    it('turns network errors into helpful next steps', () => {
        expect(friendlyErrorMessage(new Error('Failed to fetch'))).toContain(
            'couldn’t reach the server'
        );
    });
});
