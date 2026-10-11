import { Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

// What a valid invitation code leads to, as the server describes it
type Invite = { school: School; email: string; role: 'coordinator' | 'educator' | null; accountType: SignupRole };

// Codes are 12 letters/digits, typed with or without dashes and in any case
const CODE_LENGTH = 12;
const stripCode = (code: string) => code.replace(/[^a-z0-9]/gi, '');

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

    // The link in an invitation email opens /signup?code=..., so the code is
    // already filled in. It is removed from the address bar once read.
    const [searchParams, setSearchParams] = useSearchParams();
    const [initialCode] = useState(() => searchParams.get('code') || '');
    const [hasCode, setHasCode] = useState(Boolean(initialCode));
    const [inviteCode, setInviteCode] = useState(initialCode);
    const [invite, setInvite] = useState<Invite | null>(null);
    const [checkingCode, setCheckingCode] = useState(false);
    const [codeError, setCodeError] = useState<string | null>(null);
    const [email, setEmail] = useState('');

    const addingSchool = schoolId === NEW_SCHOOL;
    // Both account types may use a role-matching invitation code.
    const usingCode = hasCode;

    useEffect(() => {
        if (searchParams.has('code')) setSearchParams({}, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Look the code up as soon as it is complete, to show the school it leads to
    // and fill in the address it was sent to
    useEffect(() => {
        setInvite(null);
        setCodeError(null);
        if (!usingCode || stripCode(inviteCode).length !== CODE_LENGTH) {
            setCheckingCode(false);
            return;
        }

        let cancelled = false;
        setCheckingCode(true);
        api.post<{ invitation: Invite }>('/auth/invitations/check', {
            code: inviteCode,
        })
            .then(({ invitation }) => {
                if (cancelled) return;
                setInvite(invitation);
                setEmail(invitation.email);
                // A link from an email selects the intended account type.
                setRole(invitation.accountType);
            })
            .catch((err) => {
                if (!cancelled) {
                    setCodeError(
                        friendlyErrorMessage(
                            err,
                            'We couldn’t check that code. Please try again.'
                        )
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setCheckingCode(false);
            });
        return () => {
            cancelled = true;
        };
    }, [usingCode, inviteCode]);

    // The list is public so it can fill the dropdown before anyone has an account.
    useEffect(() => {
        let cancelled = false;

        api.get<{ schools: School[] }>('/schools')
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
                        else, including students. A matching educator or student
                        invitation code gives access straight away.
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
                                    // An invitation decides the school itself
                                    invitation_code: usingCode
                                        ? inviteCode
                                        : undefined,
                                    school_id:
                                        !usingCode && !addingSchool
                                            ? schoolId
                                            : undefined,
                                    school_name:
                                        !usingCode && addingSchool
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
                                    await api.get<MeResponse>('/me');
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

                        {(
                            <div className={styles.field}>
                                <Label>Do you have an invitation code?</Label>
                                <div
                                    className={styles.roleSelector}
                                    role="radiogroup"
                                    aria-label="Have an invitation code"
                                >
                                    {[
                                        {
                                            value: true,
                                            title: 'Yes, I have a code',
                                            blurb: 'Get access straight away',
                                        },
                                        {
                                            value: false,
                                            title: 'No invitation code',
                                            blurb: 'Wait for approval',
                                        },
                                    ].map((option) => (
                                        <button
                                            key={option.title}
                                            type="button"
                                            role="radio"
                                            aria-checked={hasCode === option.value}
                                            onClick={() => {
                                                setHasCode(option.value);
                                                setError(null);
                                            }}
                                            className={`${styles.roleOption} ${
                                                hasCode === option.value
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
                        )}

                        {usingCode && (
                            <div className={styles.field}>
                                <Label htmlFor="invitation_code">
                                    Invitation code
                                </Label>
                                <Input
                                    autoComplete="off"
                                    id="invitation_code"
                                    name="invitation_code"
                                    placeholder="XXXX-XXXX-XXXX"
                                    required
                                    type="text"
                                    value={inviteCode}
                                    onChange={(event) =>
                                        setInviteCode(
                                            event.target.value.toUpperCase()
                                        )
                                    }
                                />
                                {checkingCode && (
                                    <small className={styles.hint}>
                                        Checking your code…
                                    </small>
                                )}
                                {codeError && (
                                    <small className={styles.hint} role="alert">
                                        {codeError} You can also choose “No
                                        invitation code” and wait for approval.
                                    </small>
                                )}
                                {invite && invite.accountType !== role && (
                                    <small className={styles.hint} role="alert">
                                        This code is for a {invite.accountType} account. Select that account type to use it.
                                    </small>
                                )}
                                {invite && invite.accountType === role && (
                                    <small className={styles.hint}>
                                        You’re invited to join{' '}
                                        <strong>{invite.school.name}</strong>
                                        {invite.accountType === 'student'
                                            ? ' as a student'
                                            : invite.role === 'coordinator'
                                              ? ' as its school coordinator'
                                              : ' as an educator'}
                                        . Sign up with {invite.email}.
                                    </small>
                                )}
                            </div>
                        )}

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

                        {!usingCode && (
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
                        )}

                        {!usingCode && addingSchool && (
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
                                value={email}
                                // An invitation is for one address, so it can't change
                                readOnly={Boolean(invite)}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
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

                        <Button
                            disabled={loading || (usingCode && (!invite || invite.accountType !== role))}
                            fullWidth
                            type="submit"
                        >
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
