import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../../../src/components/ui/Button';
import styles from '../../../../src/components/ui/Button.module.css';

describe('Button', () => {
    it("renders a primary, default-size button that won't submit forms by accident", () => {
        render(<Button>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveClass(
            styles.button,
            styles.primary,
            styles.default
        );
        expect(button).not.toHaveClass(styles.fullWidth, styles.justifyStart);
    });

    it.each(['primary', 'outline', 'ghost'] as const)(
        'applies the %s variant',
        (variant) => {
            render(<Button variant={variant}>Go</Button>);
            expect(screen.getByRole('button')).toHaveClass(styles[variant]);
        }
    );

    it.each(['default', 'sm', 'icon'] as const)(
        'applies the %s size',
        (size) => {
            render(<Button size={size}>Go</Button>);
            expect(screen.getByRole('button')).toHaveClass(styles[size]);
        }
    );

    it('supports full width, left alignment and extra classes', () => {
        render(
            <Button fullWidth justify="start" className="extra">
                Go
            </Button>
        );
        expect(screen.getByRole('button')).toHaveClass(
            styles.fullWidth,
            styles.justifyStart,
            'extra'
        );
    });

    it('can be a submit button', () => {
        render(<Button type="submit">Send</Button>);
        expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('renders the icon before the label', () => {
        render(<Button icon={<svg data-testid="icon" />}>Log out</Button>);
        const button = screen.getByRole('button');
        expect(button.firstChild).toBe(screen.getByTestId('icon'));
        expect(button).toHaveTextContent('Log out');
    });

    it('forwards click handlers and disabled state', async () => {
        const onClick = vi.fn();
        const { rerender } = render(<Button onClick={onClick}>Award</Button>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);

        rerender(
            <Button onClick={onClick} disabled>
                Award
            </Button>
        );
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders a styled link when given a destination', () => {
        render(
            <MemoryRouter>
                <Button
                    to="/login"
                    variant="outline"
                    icon={<svg data-testid="icon" />}
                >
                    Log out
                </Button>
            </MemoryRouter>
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'Log out' });
        expect(link).toHaveAttribute('href', '/login');
        expect(link).toHaveClass(styles.button, styles.outline);
        expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
});
