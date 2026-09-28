import { Navigate, Route, Routes } from "react-router-dom";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Login from "./pages/auth/Login";
import ResetPassword from "./pages/auth/ResetPassword";
import Signup from "./pages/auth/Signup";
import EducatorDashboard from "./pages/educator/Dashboard";
import Entrants from "./pages/educator/Entrants";
import ExamBuilder from "./pages/educator/ExamBuilder";
import EducatorRemarks from "./pages/educator/Remarks";
import EducatorRoundDetail from "./pages/educator/RoundDetail";
import Results from "./pages/educator/Results";
import Archive from "./pages/organiser/Archive";
import CreateRound from "./pages/organiser/CreateRound";
import OrganiserDashboard from "./pages/organiser/Dashboard";
import ExamReview from "./pages/organiser/ExamReview";
import MarkingQueue from "./pages/organiser/MarkingQueue";
import RoundPapers from "./pages/organiser/RoundPapers";
import EditOlympiad from "./pages/organiser/EditOlympiad";
import Notifications from "./pages/organiser/Notifications";
import RoundReplay from "./pages/organiser/RoundReplay";
import Olympiads from "./pages/organiser/Olympiads";
import OrganiserRemarks from "./pages/organiser/Remarks";
import Schools from "./pages/organiser/Schools";
import Standings from "./pages/organiser/Standings";
import ExamSitting from "./pages/student/ExamSitting";
import StudentDashboard from "./pages/student/Dashboard";
import StudentResults from "./pages/student/Results";
import StudentRoundDetail from "./pages/student/RoundDetail";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/register" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/educator" element={<EducatorDashboard />} />
      <Route path="/educator/results" element={<Results />} />
      <Route path="/educator/remarks" element={<EducatorRemarks />} />
      <Route path="/educator/entrants" element={<Entrants />} />
      <Route path="/educator/rounds/:id" element={<EducatorRoundDetail />} />
      <Route path="/educator/rounds/:id/exam" element={<ExamBuilder />} />
      <Route path="/organiser" element={<OrganiserDashboard />} />
      <Route path="/organiser/olympiads" element={<Olympiads />} />
      <Route path="/organiser/olympiads/:id/edit" element={<EditOlympiad />} />
      <Route path="/organiser/rounds/new" element={<CreateRound />} />
      <Route path="/organiser/rounds/:id/edit" element={<RoundPapers />} />
      <Route path="/organiser/rounds/:id/papers" element={<RoundPapers />} />
      <Route path="/organiser/rounds/:id/replay" element={<RoundReplay />} />
      <Route path="/organiser/archive" element={<Archive />} />
      <Route path="/organiser/schools" element={<Schools />} />
      <Route path="/organiser/standings" element={<Standings />} />
      <Route path="/organiser/notifications" element={<Notifications />} />
      <Route path="/organiser/remarks" element={<OrganiserRemarks />} />
      <Route path="/organiser/rounds/:id/review" element={<ExamReview />} />
      <Route path="/organiser/rounds/:id/marking" element={<MarkingQueue />} />

      <Route path="/student" element={<StudentDashboard />} />
      <Route path="/student/results" element={<StudentResults />} />
      <Route path="/student/rounds/:id" element={<StudentRoundDetail />} />
      <Route path="/student/rounds/:id/exam" element={<ExamSitting />} />
    </Routes>
  );
}

export default App;
