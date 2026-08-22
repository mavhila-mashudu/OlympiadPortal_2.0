import { Trophy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import styles from "./Signup.module.css";

function Signup() {
  const navigate = useNavigate();

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
            Register your school to join the olympiad portal.
          </p>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              navigate("/organiser");
            }}
          >
            <div className={styles.field}>
              <Label htmlFor="name">Full name</Label>
              <Input
                autoComplete="name"
                id="name"
                name="name"
                placeholder="Thandi Mokoena"
                required
                type="text"
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

            <Button fullWidth type="submit">
              Create account
            </Button>
          </form>

          <p className={styles.demoNote}>
            Demo shell: authentication is not wired up. Creating an account
            opens the organiser console — use the role switcher in the sidebar
            to view the educator portal.
          </p>
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
