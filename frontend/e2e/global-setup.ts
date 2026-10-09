import { startAll } from './servers';

// Runs once before the whole E2E suite
export default async function globalSetup() {
    await startAll();
}
