import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import NotFound from './pages/public/NotFound';
import { RequireSession } from './components/auth/RequireSession';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import {
    GlobalLoadingIndicator,
    LoadingIndicator,
} from './components/ui/Feedback';
import { lazyPage } from './lib/lazyPage';

// Each page is its own chunk, so the first visit downloads only the page
// being opened instead of the whole portal.
const Home = lazyPage(() => import('./pages/public/Home'));
const ForgotPassword = lazyPage(() => import('./pages/auth/ForgotPassword'));
const Login = lazyPage(() => import('./pages/auth/Login'));
const ResetPassword = lazyPage(() => import('./pages/auth/ResetPassword'));
const Signup = lazyPage(() => import('./pages/auth/Signup'));
const EducatorDashboard = lazyPage(() => import('./pages/educator/SchoolApprovalGate'));
const Entrants = lazyPage(() => import('./pages/educator/Entrants'));
const ExamBuilder = lazyPage(() => import('./pages/educator/ExamBuilder'));
const EducatorRemarks = lazyPage(() => import('./pages/educator/Remarks'));
const EducatorRoundDetail = lazyPage(
    () => import('./pages/educator/RoundDetail')
);
const EducatorMarkingQueue = lazyPage(
    () => import('./pages/educator/MarkingQueue')
);
const Results = lazyPage(() => import('./pages/educator/Results'));
const Archive = lazyPage(() => import('./pages/organiser/Archive'));
const CreateRound = lazyPage(() => import('./pages/organiser/CreateRound'));
const OrganiserDashboard = lazyPage(
    () => import('./pages/organiser/Dashboard')
);
const ExamReview = lazyPage(() => import('./pages/organiser/ExamReview'));
const MarkingQueue = lazyPage(() => import('./pages/organiser/MarkingQueue'));
const RoundPapers = lazyPage(() => import('./pages/organiser/RoundPapers'));
const EditOlympiad = lazyPage(() => import('./pages/organiser/EditOlympiad'));
const Notifications = lazyPage(() => import('./pages/organiser/Notifications'));
const RoundReplay = lazyPage(() => import('./pages/organiser/RoundReplay'));
const Olympiads = lazyPage(() => import('./pages/organiser/Olympiads'));
const OrganiserRemarks = lazyPage(() => import('./pages/organiser/Remarks'));
const Schools = lazyPage(() => import('./pages/organiser/Schools'));
const EducatorMembershipRequests = lazyPage(() =>
    import('./pages/shared/MembershipRequests').then(({ default: Page }) => ({
        default: () => <Page mode="educator" />,
    }))
);

const OrganiserMembershipRequests = lazyPage(() =>
    import('./pages/shared/MembershipRequests').then(({ default: Page }) => ({
        default: () => <Page mode="organiser" />,
    }))
);
const SchoolInvitationsPage = lazyPage(() => import('./pages/shared/SchoolInvitationsPage'));
const Standings = lazyPage(() => import('./pages/organiser/Standings'));
const ExamSitting = lazyPage(() => import('./pages/student/ExamSitting'));
const StudentApprovalGate = lazyPage(
    () => import('./pages/student/StudentApprovalGate')
);
const StudentDashboard = lazyPage(() => import('./pages/student/Dashboard'));
const StudentResults = lazyPage(() => import('./pages/student/Results'));
const StudentRoundDetail = lazyPage(
    () => import('./pages/student/RoundDetail')
);

function App() {
    return (
        <AppErrorBoundary>
            <GlobalLoadingIndicator />
            <Suspense
                fallback={<LoadingIndicator fullPage label="Loading page" />}
            >
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/register" element={<Signup />} />
                    <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                    />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    {/* Each role's pages need a signed-in user of that role */}
                    <Route element={<RequireSession role="educator" />}>
                        <Route
                            path="/educator"
                            element={<EducatorDashboard />}
                        />
                        <Route path="/educator/results" element={<Results />} />
                        <Route path="/educator/members" element={<EducatorMembershipRequests />} />
                        <Route path="/educator/invitations" element={<SchoolInvitationsPage />} />
                        <Route
                            path="/educator/remarks"
                            element={<EducatorRemarks />}
                        />
                        <Route
                            path="/educator/entrants"
                            element={<Entrants />}
                        />
                        <Route
                            path="/educator/rounds/:id"
                            element={<EducatorRoundDetail />}
                        />
                        <Route
                            path="/educator/rounds/:id/marking"
                            element={<EducatorMarkingQueue />}
                        />
                        <Route
                            path="/educator/rounds/:id/exam"
                            element={<ExamBuilder />}
                        />
                    </Route>
                    <Route element={<RequireSession role="organiser" />}>
                        <Route
                            path="/organiser"
                            element={<OrganiserDashboard />}
                        />
                        <Route
                            path="/organiser/olympiads"
                            element={<Olympiads />}
                        />
                        <Route
                            path="/organiser/olympiads/:id/edit"
                            element={<EditOlympiad />}
                        />
                        <Route
                            path="/organiser/rounds/new"
                            element={<CreateRound />}
                        />
                        <Route
                            path="/organiser/rounds/:id/edit"
                            element={<RoundPapers />}
                        />
                        <Route
                            path="/organiser/rounds/:id/papers"
                            element={<RoundPapers />}
                        />
                        <Route
                            path="/organiser/rounds/:id/replay"
                            element={<RoundReplay />}
                        />
                        <Route
                            path="/organiser/archive"
                            element={<Archive />}
                        />
                        <Route
                            path="/organiser/schools"
                            element={<Schools />}
                        />
                        <Route path="/organiser/educators" element={<OrganiserMembershipRequests />} />
                        <Route
                            path="/organiser/standings"
                            element={<Standings />}
                        />
                        <Route
                            path="/organiser/notifications"
                            element={<Notifications />}
                        />
                        <Route
                            path="/organiser/remarks"
                            element={<OrganiserRemarks />}
                        />
                        <Route
                            path="/organiser/rounds/:id/review"
                            element={<ExamReview />}
                        />
                        <Route
                            path="/organiser/rounds/:id/marking"
                            element={<MarkingQueue />}
                        />
                    </Route>
                    <Route element={<RequireSession role="student" />}>
                        <Route element={<StudentApprovalGate />}>
                            <Route
                                path="/student"
                                element={<StudentDashboard />}
                            />
                            <Route
                                path="/student/results"
                                element={<StudentResults />}
                            />
                            <Route
                                path="/student/rounds/:id"
                                element={<StudentRoundDetail />}
                            />
                            <Route
                                path="/student/rounds/:id/exam"
                                element={<ExamSitting />}
                            />
                        </Route>
                    </Route>
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Suspense>
        </AppErrorBoundary>
    );
}

export default App;
