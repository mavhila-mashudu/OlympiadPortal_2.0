import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import EducatorDashboard from "./pages/educator/Dashboard";
import Entrants from "./pages/educator/Entrants";
import ExamBuilder from "./pages/educator/ExamBuilder";
import EducatorRoundDetail from "./pages/educator/RoundDetail";
import Results from "./pages/educator/Results";
import Archive from "./pages/organiser/Archive";
import CreateRound from "./pages/organiser/CreateRound";
import OrganiserDashboard from "./pages/organiser/Dashboard";
import ExamReview from "./pages/organiser/ExamReview";
import MarkingQueue from "./pages/organiser/MarkingQueue";
import Olympiads from "./pages/organiser/Olympiads";
import Schools from "./pages/organiser/Schools";
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
      <Route path="/educator" element={<EducatorDashboard />} />
      <Route path="/educator/results" element={<Results />} />
      <Route path="/educator/entrants" element={<Entrants />} />
      <Route path="/educator/rounds/:id" element={<EducatorRoundDetail />} />
      <Route path="/educator/rounds/:id/exam" element={<ExamBuilder />} />
      <Route path="/organiser" element={<OrganiserDashboard />} />
      <Route path="/organiser/olympiads" element={<Olympiads />} />
      <Route path="/organiser/rounds/new" element={<CreateRound />} />
      <Route path="/organiser/archive" element={<Archive />} />
      <Route path="/organiser/schools" element={<Schools />} />
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
