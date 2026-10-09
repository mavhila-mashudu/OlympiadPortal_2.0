import { Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert, LoadingIndicator } from '../../components/ui/Feedback';
import { friendlyErrorMessage } from '../../lib/feedback';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { getSupabaseClient } from '../../lib/supabase';
import styles from './Login.module.css';

const MIN_LENGTH = 8;

// Step 2 of a password reset: the emailed link lands here with a one-time
// token. Exchanging it allows one password change; the user then logs in with
// the new password as normal.
function ResetPassword() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [ready, setReady] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const tokenHash = params.get('token_hash') ?? params.get('token') ?? '';

    useEffect(() => {
        let cancelled = false;

        async function exchangeToken() {
            if (!tokenHash) {
                setError(
                    'This reset link is invalid. Please request a new one.'
                );
                return;
            }
            try {
                const supabase = getSupabaseClient();
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    type: 'recovery',
                    token_hash: tokenHash,
                });
                if (verifyError) throw new Error(verifyError.message);
                if (!cancelled) setReady(true);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error && err.message
                            ? err.message
                            : 'This reset link is invalid or has expired. Please request a new one.'
                    );
                }
            }
        }

        exchangeToken();
        return () => {
            cancelled = true;
        };
    }, [tokenHash]);

    return (
        <div className={styles.page}>
            <div className={styles.panel}>
                <Link className={styles.brand} to="/login">
                    <span className={styles.brandMark}>
                        <Trophy aria-hidden="true" />
                    </span>
                    <span>Olympiad Portal</span>
                </Link>

                {error && (
                    <ErrorAlert
                        message={error}
                        onDismiss={() => setError(null)}
                    />
                )}
                <Card className={styles.card}>
                    <h1>Choose a new password</h1>

                    {done ? (
                        <p className={styles.subtitle} role="status">
                            Your password has been changed. You can now log in
                            with it.
                        </p>
                    ) : (
                        <form
                            className={styles.form}
                            onSubmit={async (event) => {
                                event.preventDefault();
                                setError(null);
                                const form = new FormData(event.currentTarget);
                                const password = String(
                                    form.get('password') ?? ''
                                );
                                const confirmation = String(
                                    form.get('confirm-password') ?? ''
                                );

                                if (password.length < MIN_LENGTH) {
                                    setError(
                                        `Use at least ${MIN_LENGTH} characters.`
                                    );
                                    return;
                                }
                                if (password !== confirmation) {
                                    setError('The two passwords don’t match.');
                                    return;
                                }

                                setSaving(true);
                                try {
                                    const supabase = getSupabaseClient();
                                    const { error: updateError } =
                                        await supabase.auth.updateUser({
                                            password,
                                        });
                                    if (updateError)
                                        throw new Error(updateError.message);
                                    // The recovery session must not outlive the reset itself
                                    await supabase.auth
                                        .signOut({ scope: 'local' })
                                        .catch(() => {});
                                    setDone(true);
                                    setTimeout(() => navigate('/login'), 2000);
                                } catch (err) {
                                    setError(
                                        friendlyErrorMessage(
                                            err,
                                            'We couldn’t change your password. Please try again.'
                                        )
                                    );
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            <div className={styles.field}>
                                <Label htmlFor="password">New password</Label>
                                <Input
                                    autoComplete="new-password"
                                    id="password"
                                    name="password"
                                    required
                                    type="password"
                                />
                            </div>

                            <div className={styles.field}>
                                <Label htmlFor="confirm-password">
                                    Confirm new password
                                </Label>
                                <Input
                                    autoComplete="new-password"
                                    id="confirm-password"
                                    name="confirm-password"
                                    required
                                    type="password"
                                />
                            </div>

                            {!ready && !error && (
                                <LoadingIndicator label="Checking your reset link" />
                            )}

                            <Button
                                disabled={!ready || saving}
                                fullWidth
                                type="submit"
                            >
                                {saving ? 'Saving...' : 'Save new password'}
                            </Button>
                        </form>
                    )}
                </Card>

                <p className={styles.signup}>
                    <Link className={styles.inlineLink} to="/login">
                        Back to log in
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default ResetPassword;
