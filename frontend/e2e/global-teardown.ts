import { stopAll } from "./servers";

// Runs once after the whole E2E suite
export default async function globalTeardown() {
  await stopAll();
}
