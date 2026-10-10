import type { CSSProperties } from 'react';

type ToastProps = {
    type: 'success' | 'error';
    message: string;
    onDismiss: () => void;
};

export function Toast({ type, message, onDismiss }: ToastProps) {
    const colors: CSSProperties =
        type === 'success'
            ? {
                  backgroundColor: '#ecfdf5',
                  borderColor: '#86efac',
                  color: '#166534',
              }
            : {
                  backgroundColor: '#fef2f2',
                  borderColor: '#fca5a5',
                  color: '#991b1b',
              };

    return (
        <div
            role="alert"
            style={{
                position: 'fixed',
                right: '1.5rem',
                bottom: '1.5rem',
                zIndex: 100,
                display: 'flex',
                maxWidth: '26rem',
                alignItems: 'start',
                gap: '0.75rem',
                padding: '0.9rem 1rem',
                border: '1px solid',
                borderRadius: '0.5rem',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.15)',
                ...colors,
            }}
        >
            <span style={{ flex: 1 }}>{message}</span>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss notification"
                style={{
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                }}
            >
                ×
            </button>
        </div>
    );
}
