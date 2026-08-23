import { Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api, setToken } from "../../lib/api";
import styles from "./Login.module.css";

type DevLoginResponse = {
  user: { id: string; email: string; full_name: string; role: string };
  accessToken: string;
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

              try {
                const { accessToken } = await api.post<DevLoginResponse>(
                  "/auth/dev-login",
                  {
                    email,
                    full_name: email.split("@")[0],
                    role: "organiser",
                  },
                );

                setToken(accessToken);
                navigate("/organiser");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Login failed");
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
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                type="password"
              />
            </div>

            {error && <p className={styles.demoNote}>{error}</p>}

            <Button disabled={loading} fullWidth type="submit">
              {loading ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className={styles.demoNote}>
            Dev shortcut: any email logs you in as an organiser. Password
            isn&apos;t checked.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default Login;