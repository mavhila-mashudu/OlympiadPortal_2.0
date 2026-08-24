import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/auth/Login";
import EducatorDashboard from "./pages/educator/Dashboard";
import Entrants from "./pages/educator/Entrants";
import Results from "./pages/educator/Results";
import Archive from "./pages/organiser/Archive";
import CreateRound from "./pages/organiser/CreateRound";
import OrganiserDashboard from "./pages/organiser/Dashboard";
import Olympiads from "./pages/organiser/Olympiads";
import Schools from "./pages/organiser/Schools";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/educator" element={<EducatorDashboard />} />
      <Route path="/educator/results" element={<Results />} />
      <Route path="/educator/entrants" element={<Entrants />} />
      <Route path="/organiser" element={<OrganiserDashboard />} />
      <Route path="/organiser/olympiads" element={<Olympiads />} />
      <Route path="/organiser/rounds/new" element={<CreateRound />} />
      <Route path="/organiser/archive" element={<Archive />} />
      <Route path="/organiser/schools" element={<Schools />} />
    </Routes>
  );
}

export default App;