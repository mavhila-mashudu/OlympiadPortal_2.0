import { Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<"organiser" | "invited">(
    searchParams.get("code") || searchParams.get("token") ? "invited" : "organiser"
  );

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
            Sign up as an organiser to create your own olympiad, or use an invitation code to join as an educator or student.
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
              const code = (formData.get("code") as string) || "";
              const invite_token = searchParams.get("token") || "";

              try {
                const payload = { full_name, email, password };

                if (accountType === "organiser") {
                  await api.post("/auth/register/organiser", payload);
                } else {
                  await api.post("/auth/register", {
                    ...payload,
                    code,
                    invite_token,
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
                const message = err instanceof Error ? err.message : "";
                setError(
                  message === "Failed to fetch"
                    ? "We couldn’t reach the server. Make sure the frontend and backend are running, then try again."
                    : message || "We couldn’t create your account. Please try again.",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className={styles.field}>
              <Label>Account type</Label>
              <div className={styles.roleSelector} style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setAccountType("organiser")}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    border: accountType === "organiser" ? "2px solid #2563eb" : "1px solid #d1d5db",
                    borderRadius: "0.5rem",
                    backgroundColor: accountType === "organiser" ? "#eff6ff" : "white",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <strong>Organiser</strong>
                  <br />
                  <small style={{ color: "#6b7280" }}>Create and manage olympiads</small>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType("invited")}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    border: accountType === "invited" ? "2px solid #2563eb" : "1px solid #d1d5db",
                    borderRadius: "0.5rem",
                    backgroundColor: accountType === "invited" ? "#eff6ff" : "white",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <strong>Educator / Student</strong>
                  <br />
                  <small style={{ color: "#6b7280" }}>Join with invitation code</small>
                </button>
              </div>
            </div>

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

            {accountType === "invited" && (
              <div className={styles.field}>
                <Label htmlFor="code">Invitation code</Label>
                <Input
                  autoComplete="one-time-code"
                  id="code"
                  name="code"
                  placeholder="SCH-ABC123 or STU-ABC123"
                  defaultValue={searchParams.get("code") || ""}
                  required={accountType === "invited"}
                  type="text"
                />
              </div>
            )}

            <div className={styles.field}>
              <Label htmlFor="email">Email address</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                placeholder="you@example.com"
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
