import { Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api, setToken } from "../../lib/api";
import { dashboardForRole } from "../../lib/auth";
import { getSupabaseClient } from "../../lib/supabase";
import styles from "./Login.module.css";

type MeResponse = {
  user: { role: "organiser" | "educator" | "student" };
};

function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <Link className={styles.brand} to="/login" aria-current="page">
          <span className={styles.brandMark}>
            <Trophy aria-hidden="true" />
          </span>
          <span>Olympiad Portal</span>
        </Link>

        <Card className={styles.card}>
          <h1>Log in</h1>
          <p className={styles.subtitle}>
            Access your organiser console or educator portal.
          </p>

          <form
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setLoading(true);

              const formData = new FormData(event.currentTarget);
              const email = (formData.get("email") as string) || "";
              const password = (formData.get("password") as string) || "";

              try {
                const supabase = getSupabaseClient();
                const { data, error: signInError } =
                  await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });

                if (signInError) throw new Error(signInError.message);
                if (!data.session?.access_token) {
                  throw new Error("Supabase did not return an access token");
                }

                setToken(data.session.access_token);
                const { user } = await api.get<MeResponse>("/auth/me");
                navigate(dashboardForRole(user.role));
              } catch (err) {
                const message = err instanceof Error ? err.message : "";
                setError(
                  message === "Failed to fetch"
                    ? "We couldn’t reach the server. Make sure the frontend and backend are running, then try again."
                    : message || "We couldn’t log you in. Please check your email and password.",
                );
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

            <div className={styles.field}>
              <span className={styles.fieldHeader}>
                <Label htmlFor="password">Password</Label>
                <Link className={styles.inlineLink} to="/forgot-password">
                  Forgot password?
                </Link>
              </span>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                required
                type="password"
              />
            </div>

            {error && <p className={styles.demoNote}>{error}</p>}

            <Button disabled={loading} fullWidth type="submit">
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </Card>

        <p className={styles.signup}>
          Registering as an organiser?{" "}
          <Link className={styles.inlineLink} to="/signup">
            Create organiser account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
