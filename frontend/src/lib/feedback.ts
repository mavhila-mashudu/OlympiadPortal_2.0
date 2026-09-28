// Only a failed network call is rewritten; anything the backend or Supabase
// said is specific and actionable, so it is shown as-is.
export function friendlyErrorMessage(error: unknown, fallback = "Please try again.") {
  const message = error instanceof Error ? error.message : "";
  if (message === "Failed to fetch" || /networkerror|network request failed/i.test(message)) {
    return "We couldn’t reach the server. Make sure the frontend and backend are running, then try again.";
  }
  return message || fallback;
}
