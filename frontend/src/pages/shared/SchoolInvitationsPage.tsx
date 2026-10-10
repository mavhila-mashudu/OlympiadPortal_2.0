import { AppShell } from '../../components/layout/AppShell';
import { educatorNav } from '../../lib/mockData';
import InviteEducators from './InviteEducators';

export default function SchoolInvitationsPage() {
    return (
        <AppShell activeRole="educator" navItems={educatorNav}
            organisation="Your school" portalLabel="Educator portal">
            <header>
                <h1>Invite schoolmates</h1>
                <p>Send an email code to an educator or student joining your school.</p>
            </header>
            <InviteEducators mode="educator" />
        </AppShell>
    );
}
