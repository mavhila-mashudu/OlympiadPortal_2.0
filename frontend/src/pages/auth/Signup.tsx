import { Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api, setToken } from "../../lib/api";
import { getSupabaseClient } from "../../lib/supabase";
import styles from "./Signup.module.css";

type Role = "organiser" | "educator" | "student";

type MeResponse = {
  user: { role: Role };
};

const dashboardForRole = (role: Role) => {
  if (role === "organiser") return "/organiser";
  if (role === "educator") return "/educator";
  return "/student";
};

function Signup() {
  const navigate = useNavigate();
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

        <Card className={styles.card}>
          <h1>Create account</h1>
          <p className={styles.subtitle}>
            Use an organiser secret or an invitation code to join.
          </p>

          <form
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setLoading(true);

              const formData = new FormData(event.currentTarget);
              const full_name = (formData.get("full_name") as string) || "";
              const email = (formData.get("email") as string) || "";
              const password = (formData.get("password") as string) || "";
              const organiser_secret =
                (formData.get("organiser_secret") as string) || "";
              const code = (formData.get("code") as string) || "";

              try {
                const payload = { full_name, email, password };

                if (organiser_secret) {
                  await api.post("/auth/register/organiser", {
                    ...payload,
                    organiser_secret,
                  });
                } else {
                  await api.post("/auth/register", {
                    ...payload,
                    code,
                  });
                }

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
                setError(
                  err instanceof Error ? err.message : "Registration failed",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className={styles.field}>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                autoComplete="name"
                id="full_name"
                name="full_name"
                placeholder="Thandi Mokoena"
                required
                type="text"
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="code">Invitation code</Label>
              <Input
                autoComplete="one-time-code"
                id="code"
                name="code"
                placeholder="SCH-ABC123 or STU-ABC123"
                type="text"
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="organiser_secret">Organiser secret</Label>
              <Input
                id="organiser_secret"
                name="organiser_secret"
                placeholder="Only needed for organiser registration"
                type="password"
              />
            </div>

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
                autoComplete="new-password"
                id="password"
                name="password"
                required
                type="password"
              />
            </div>

            {error && <p className={styles.demoNote}>{error}</p>}

            <Button disabled={loading} fullWidth type="submit">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Card>

        <p className={styles.signup}>
          Already have an account?{" "}
          <Link className={styles.inlineLink} to="/login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;
