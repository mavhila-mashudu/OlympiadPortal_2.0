export type UserRole = "organiser" | "educator" | "student";

// Where each role lands after logging in or signing up
export const dashboardForRole = (role: UserRole) => {
  if (role === "organiser") return "/organiser";
  if (role === "educator") return "/educator";
  return "/student";
};
