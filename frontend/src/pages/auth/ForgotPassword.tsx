import { Trophy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorAlert } from "../../components/ui/Feedback";
import { friendlyErrorMessage } from "../../lib/feedback";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { getSupabaseClient } from "../../lib/supabase";
import styles from "./Login.module.css";

// Step 1 of a password reset: ask Supabase to email a reset link. The link
// returns to /reset-password, where the new password is chosen.
function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <Link className={styles.brand} to="/login">
          <span className={styles.brandMark}>
            <Trophy aria-hidden="true" />
          </span>
          <span>Olympiad Portal</span>
        </Link>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        <Card className={styles.card}>
          <h1>Reset your password</h1>
          <p className={styles.subtitle}>
            Enter your email address and we&apos;ll send you a link to choose a
            new password.
          </p>

          {sent ? (
            <p className={styles.subtitle} role="status">
              If an account exists for that address, a reset link is on its way.
              Check your inbox and follow the link to finish.
            </p>
          ) : (
            <form
              className={styles.form}
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setLoading(true);
                const email = String(
                  new FormData(event.currentTarget).get("email") ?? "",
                );

                try {
                  const supabase = getSupabaseClient();
                  const { error: resetError } =
                    await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                  if (resetError) throw new Error(resetError.message);
                  // Shown whether or not the address has an account, so the
                  // form can't be used to find out who is registered
                  setSent(true);
                } catch (err) {
                  setError(friendlyErrorMessage(err, "We couldn’t send the reset link. Please try again."));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div className={styles.field}>
                <Label htmlFor="email">Email address</Label>
                <Input
                  autoComplete="email"
                  id="email"
                  name="email"
                  placeholder="you@school.edu"
                  required
                  type="email"
                />
              </div>

              <Button disabled={loading} fullWidth type="submit">
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </Card>

        <p className={styles.signup}>
          Remembered it?{" "}
          <Link className={styles.inlineLink} to="/login">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
