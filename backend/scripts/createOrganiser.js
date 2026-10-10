// @ts-nocheck
// Creates an organiser account. Organisers can see and run every olympiad they
// own, so the public sign-up form does not offer the role: the portal
// administrator provisions each organiser here instead.
//
//   npx tsx scripts/createOrganiser.js "Thandi Mokoena" thandi@example.com
//
// The password is read from ORGANISER_PASSWORD. If that is not set, a random
// one is generated and printed once; the organiser can change it with
// "Forgot password" on the login page.
//
// Run it with the same DATABASE_URL / SUPABASE_* environment as the server.
require('dotenv').config();
const crypto = require('crypto');

const MIN_PASSWORD_RULES = [
    [(p) => p.length >= 8, 'at least 8 characters'],
    [(p) => /[A-Z]/.test(p), 'an uppercase letter'],
    [(p) => /[0-9]/.test(p), 'a number'],
];

const generatePassword = () => {
    // Base64url of 12 random bytes, plus a fixed suffix so the signup rules
    // (uppercase + number) are always met whatever the random part contains.
    return `${crypto.randomBytes(12).toString('base64url')}A1`;
};

async function main() {
    const [fullName, rawEmail] = process.argv.slice(2);
    if (!fullName || !rawEmail) {
        console.error(
            'Usage: npx tsx scripts/createOrganiser.js "Full Name" email@example.com'
        );
        process.exit(1);
    }

    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error(`"${rawEmail}" is not a valid email address.`);
        process.exit(1);
    }

    const supplied = process.env.ORGANISER_PASSWORD;
    const password = supplied || generatePassword();
    const failed = MIN_PASSWORD_RULES.filter(([ok]) => !ok(password)).map(
        ([, rule]) => rule
    );
    if (failed.length > 0) {
        console.error(`ORGANISER_PASSWORD must contain ${failed.join(', ')}.`);
        process.exit(1);
    }

    // Loaded after the checks so a typo in the arguments fails fast, without
    // needing a database connection.
    const { registerOrganiser } = require('../src/services/authService');
    const { user } = await registerOrganiser({
        full_name: fullName.trim(),
        email,
        password,
    });

    console.log(
        `Created organiser ${user.full_name} <${user.email}> (${user.id}).`
    );
    if (!supplied) {
        console.log(`Temporary password (shown once): ${password}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(`Could not create the organiser: ${err.message}`);
        process.exit(1);
    });
