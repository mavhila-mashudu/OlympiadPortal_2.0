// @ts-nocheck
require('dotenv').config();

const required = ['DATABASE_URL', 'SUPABASE_URL'];

const missing = required.filter((key) => !process.env[key]);

if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_KEY
) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
}

if (process.env.NODE_ENV !== 'test' && missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    process.exit(1);
}

module.exports = {
    app: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
        isProd: process.env.NODE_ENV === 'production',
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceRoleKey:
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_SERVICE_KEY,
    },
    frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:5173',
    },
};
