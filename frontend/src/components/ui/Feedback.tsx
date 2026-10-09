import { AlertCircle, RefreshCw, X } from 'lucide-react';
import {
    useEffect,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import {
    LOADING_SHOW_DELAY_MS,
    isPageLoading,
    subscribeToPageLoad,
} from '../../lib/loadingStore';
import styles from './Feedback.module.css';

type ErrorAlertProps = {
    message: string;
    title?: string;
    onDismiss?: () => void;
    onRetry?: () => void;
    className?: string;
};

type LoadingIndicatorProps = {
    label?: string;
    fullPage?: boolean;
    className?: string;
    /** How long a load must last before the spinner appears (ms) */
    delay?: number;
};

function classes(...values: Array<string | false | undefined>) {
    return values.filter(Boolean).join(' ');
}

export function ErrorAlert({
    message,
    title = 'We couldn’t complete that request',
    onDismiss,
    onRetry,
    className,
}: ErrorAlertProps) {
    return (
        <section
            aria-atomic="true"
            aria-live="assertive"
            className={classes(styles.alert, className)}
            role="alert"
            tabIndex={-1}
        >
            <AlertCircle aria-hidden="true" className={styles.alertIcon} />
            <div className={styles.alertContent}>
                <strong>{title}</strong>
                <p>{message}</p>
                {onRetry && (
                    <button
                        className={styles.retry}
                        onClick={onRetry}
                        type="button"
                    >
                        <RefreshCw aria-hidden="true" /> Try again
                    </button>
                )}
            </div>
            {onDismiss && (
                <button
                    aria-label="Dismiss error message"
                    className={styles.dismiss}
                    onClick={onDismiss}
                    type="button"
                >
                    <X aria-hidden="true" />
                </button>
            )}
        </section>
    );
}

export function GlobalLoadingOverlay() {
    const isLoading = useSyncExternalStore(
        subscribeToPageLoad,
        isPageLoading,
        () => false
    );
    if (!isLoading) return null;

    return (
        <div aria-live="polite" className={styles.loadingOverlay} role="status">
            <div className={styles.loadingDialog}>
                <span aria-hidden="true" className={styles.largeSpinner} />
                <strong>Loading</strong>
                <span>Please wait while we prepare your page.</span>
            </div>
        </div>
    );
}

export function LoadingIndicator({
    label = 'Loading content',
    fullPage = false,
    className,
    delay = LOADING_SHOW_DELAY_MS,
}: LoadingIndicatorProps) {
    // Fast loads finish before the delay and never show a spinner
    const [visible, setVisible] = useState(delay <= 0);
    useEffect(() => {
        if (delay <= 0) return;
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);
    if (!visible) return null;

    return (
        <div
            aria-busy="true"
            aria-live="polite"
            className={classes(
                styles.loading,
                fullPage && styles.fullPage,
                className
            )}
            role="status"
        >
            <span aria-hidden="true" className={styles.spinner} />
            <span>{label}</span>
        </div>
    );
}

type PageFeedbackProps = {
    error?: string | null;
    loading?: boolean;
    loadingLabel?: string;
    onDismissError?: () => void;
    onRetry?: () => void;
    children: ReactNode;
};

export function PageFeedback({
    error,
    loading = false,
    loadingLabel,
    onDismissError,
    onRetry,
    children,
}: PageFeedbackProps) {
    if (loading) return <LoadingIndicator fullPage label={loadingLabel} />;

    return (
        <>
            {error && (
                <ErrorAlert
                    message={error}
                    onDismiss={onDismissError}
                    onRetry={onRetry}
                />
            )}
            {children}
        </>
    );
}
