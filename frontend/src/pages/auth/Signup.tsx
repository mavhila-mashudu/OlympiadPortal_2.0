import { Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert } from '../../components/ui/Feedback';
import { friendlyErrorMessage } from '../../lib/feedback';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { api, clearToken, setToken } from '../../lib/api';
import { dashboardForRole } from '../../lib/auth';
import { startSession } from '../../lib/session';
import { getSupabaseClient } from '../../lib/supabase';
import styles from './Signup.module.css';

// Organisers are not offered here: the portal administrator creates those accounts.
type Role = 'organiser' | 'educator' | 'student';
type SignupRole = Exclude<Role, 'organiser'>;

type MeResponse = {
    user: { role: Role };
};

type School = { id: string; name: string };

const NEW_SCHOOL = '__new__';

const roleOptions: { value: SignupRole; title: string; blurb: string }[] = [
    {
        value: 'educator',
        title: 'Educator',
        blurb: "Enter your school's students",
    },
    {
        value: 'student',
        title: 'Student',
        blurb: 'Sit rounds and see your results',
    },
];

function Signup() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState<SignupRole>('educator');
    const [schools, setSchools] = useState<School[]>([]);
    const [schoolsError, setSchoolsError] = useState<string | null>(null);
    const [schoolId, setSchoolId] = useState('');
    const [newSchoolName, setNewSchoolName] = useState('');

    const addingSchool = schoolId === NEW_SCHOOL;

    // The list is public so it can fill the dropdown before anyone has an account.
    useEffect(() => {
        let cancelled = false;

        api.get<{ schools: School[] }>('/auth/schools')
            .then((data) => {
                if (!cancelled) setSchools(data.schools || []);
            })
            .catch(() => {
                if (!cancelled) {
                    setSchoolsError(
                        "We couldn't load the list of schools. You can still type yours below."
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className={styles.page}>
            <div className={styles.panel}>
                <Link className={styles.brand} to="/login">
                    <span className={styles.brandMark}>
                        <Trophy aria-hidden="true" />
                    </span>
                    <span>Olympiad Portal</span>
                </Link>

                {(error || schoolsError) && (
                    <ErrorAlert
                        message={
                            error ||
                            schoolsError ||
                            'We couldn’t load the information you need.'
                        }
                        onDismiss={() => {
                            setError(null);
                            setSchoolsError(null);
                        }}
                    />
                )}
                <Card className={styles.card}>
                    <h1>Create account</h1>
                    <p className={styles.subtitle}>
                        Choose how you take part. Educators and students tell us
                        which school they belong to. Access starts after
                        approval: organisers review a school's first
                        educator, and school coordinators review everyone
                        else, including students.
                    </p>

                    <form
                        className={styles.form}
                        onSubmit={async (event) => {
                            event.preventDefault();
                            setError(null);
                            setLoading(true);

                            const formData = new FormData(event.currentTarget);
                            const full_name =
                                (formData.get('full_name') as string) || '';
                            const email =
                                (formData.get('email') as string) || '';
                            const password =
                                (formData.get('password') as string) || '';

                            try {
                                await api.post('/auth/register', {
                                    full_name,
                                    email,
                                    password,
                                    role,
                                    school_id: !addingSchool
                                        ? schoolId
                                        : undefined,
                                    school_name: addingSchool
                                        ? newSchoolName.trim()
                                        : undefined,
                                });

                                const supabase = getSupabaseClient();
                                const { data, error: signInError } =
                                    await supabase.auth.signInWithPassword({
                                        email,
                                        password,
                                    });

                                if (signInError)
                                    throw new Error(signInError.message);
                                if (!data.session?.access_token) {
                                    throw new Error(
                                        'Supabase did not return an access token'
                                    );
                                }

                                setToken(data.session.access_token);
                                const { user } =
                                    await api.get<MeResponse>('/auth/me');
                                startSession(
                                    data.session.access_token,
                                    user.role
                                );
                                navigate(dashboardForRole(user.role), {
                                    replace: true,
                                });
                            } catch (err) {
                                clearToken();
                                setError(
                                    friendlyErrorMessage(
                                        err,
                                        'We couldn’t create your account. Please try again.'
                                    )
                                );
                            } finally {
                                setLoading(false);
                            }
                        }}
                    >
                        <div className={styles.field}>
                            <Label>Account type</Label>
                            <div
                                className={styles.roleSelector}
                                role="radiogroup"
                                aria-label="Account type"
                            >
                                {roleOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={role === option.value}
                                        onClick={() => {
                                            setRole(option.value);
                                            setError(null);
                                        }}
                                        className={`${styles.roleOption} ${
                                            role === option.value
                                                ? styles.roleOptionActive
                                                : ''
                                        }`}
                                    >
                                        <strong>{option.title}</strong>
                                        <small>{option.blurb}</small>
                                    </button>
                                ))}
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

                        <div className={styles.field}>
                            <Label htmlFor="school">School</Label>
                            <select
                                className={styles.select}
                                id="school"
                                name="school"
                                required
                                value={schoolId}
                                onChange={(event) =>
                                    setSchoolId(event.target.value)
                                }
                            >
                                <option value="">Select your school…</option>
                                {schools.map((school) => (
                                    <option key={school.id} value={school.id}>
                                        {school.name}
                                    </option>
                                ))}
                                {role === 'educator' && (
                                    <option value={NEW_SCHOOL}>
                                        My school isn’t listed…
                                    </option>
                                )}
                            </select>
                            {role === 'student' && (
                                <small className={styles.hint}>
                                    Students join a school an educator has
                                    already added, and the school's coordinator
                                    approves your request. If yours is missing,
                                    ask your teacher to sign up first.
                                </small>
                            )}
                        </div>

                        {addingSchool && (
                            <div className={styles.field}>
                                <Label htmlFor="school_name">School name</Label>
                                <Input
                                    id="school_name"
                                    name="school_name"
                                    placeholder="e.g. Parktown Boys High"
                                    required
                                    type="text"
                                    value={newSchoolName}
                                    onChange={(event) =>
                                        setNewSchoolName(event.target.value)
                                    }
                                />
                                <small className={styles.hint}>
                                    Your request will be reviewed by an organiser.
                                    Once approved, you can coordinate your school.
                                </small>
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

                        <Button disabled={loading} fullWidth type="submit">
                            {loading ? 'Creating account...' : 'Create account'}
                        </Button>
                    </form>
                </Card>

                <p className={styles.signup}>
                    Already have an account?{' '}
                    <Link className={styles.inlineLink} to="/login">
                        Log in
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default Signup;
