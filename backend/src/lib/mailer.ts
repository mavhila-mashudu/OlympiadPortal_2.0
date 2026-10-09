type Email = { to: string; subject: string; html: string };

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const logUndeliveredEmail = (email: Email, reason: string) => {
    console.warn(`Email was not delivered (${reason}).`, {
        to: email.to,
        subject: email.subject,
    });
};

/** Whether every EmailJS setting is present, so a send can be attempted. */
export function isMailerConfigured() {
    return Boolean(
        process.env.EMAILJS_SERVICE_ID &&
        process.env.EMAILJS_TEMPLATE_ID &&
        process.env.EMAILJS_USER_ID &&
        process.env.EMAILJS_PRIVATE_KEY
    );
}

/** Deliver via EmailJS REST API. */
async function deliver(email: Email): Promise<{ delivered: boolean }> {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const userId = process.env.EMAILJS_USER_ID;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !userId || !privateKey) {
        console.log('[EmailJS] NOT CONFIGURED — missing env vars:', {
            EMAILJS_SERVICE_ID: serviceId ? 'set' : 'MISSING',
            EMAILJS_TEMPLATE_ID: templateId ? 'set' : 'MISSING',
            EMAILJS_USER_ID: userId ? 'set' : 'MISSING',
            EMAILJS_PRIVATE_KEY: privateKey ? 'set' : 'MISSING',
        });
        console.log('Email preview (EmailJS not configured):', {
            to: email.to,
            subject: email.subject,
        });
        return { delivered: false };
    }

    try {
        const response = await fetch(EMAILJS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: userId,
                accessToken: privateKey,
                template_params: {
                    to_email: email.to,
                    subject: email.subject,
                    html_content: email.html,
                },
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const details = await response.text();
            console.error(`[EmailJS] API error ${response.status}:`, details);
            logUndeliveredEmail(
                email,
                `EmailJS ${response.status}: ${details.slice(0, 300)}`
            );
            return { delivered: false };
        }

        console.log(`[EmailJS] Email sent successfully to ${email.to}`);
        return { delivered: true };
    } catch (error) {
        logUndeliveredEmail(
            email,
            `EmailJS request failed: ${error instanceof Error ? error.message : 'unknown error'}`
        );
        return { delivered: false };
    }
}

const registrationLink = (url: string) =>
    `<p><a href="${url}">Click here to register</a></p><p>If the button does not work, copy this link into your browser:<br />${url}</p>`;

export async function sendSchoolInviteEmail({
    to,
    schoolName,
    olympiadName,
    inviteCode,
    registrationUrl,
}: {
    to: string;
    schoolName: string;
    olympiadName: string;
    inviteCode: string;
    registrationUrl: string;
}) {
    return deliver({
        to,
        subject: `Invitation to register ${schoolName} for ${olympiadName}`,
        html: `<h2>School invitation</h2><p>You've been invited to register <strong>${schoolName}</strong> for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}`,
    });
}

export async function sendStudentInviteEmail({
    to,
    olympiadName,
    inviteCode,
    registrationUrl,
}: {
    to: string;
    olympiadName: string;
    inviteCode: string;
    registrationUrl: string;
}) {
    return deliver({
        to,
        subject: `Invitation to register for ${olympiadName}`,
        html: `<h2>Olympiad student invitation</h2><p>You've been invited to register for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}`,
    });
}

export async function sendEducatorInviteEmail({
    to,
    olympiadName,
    inviteCode,
    registrationUrl,
}: {
    to: string;
    olympiadName: string;
    inviteCode: string;
    registrationUrl: string;
}) {
    return deliver({
        to,
        subject: `Invitation to coordinate ${olympiadName}`,
        html: `<h2>Educator invitation</h2><p>You have been invited to help manage students for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}`,
    });
}

/** A password reset link, which works once and then expires. */
export async function sendPasswordResetEmail({
    to,
    resetUrl,
}: {
    to: string;
    resetUrl: string;
}) {
    return deliver({
        to,
        subject: 'Reset your Olympiad Portal password',
        html: `<h2>Reset your password</h2><p>We received a request to reset the password for your Olympiad Portal account.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>If the button does not work, copy this link into your browser:<br />${resetUrl}</p><p>The link works once and expires after a while. If you didn't ask for a reset, you can ignore this email; your password stays the same.</p>`,
    });
}

/**
 * Generic round-notification email (round opening/closing reminders, results
 * released). The caller supplies the fully rendered HTML so the EmailJS
 * template stays a passthrough, exactly like the invitation emails above.
 */
export async function sendNotificationEmail({
    to,
    subject,
    html,
}: {
    to: string;
    subject: string;
    html: string;
}) {
    return deliver({ to, subject, html });
}
