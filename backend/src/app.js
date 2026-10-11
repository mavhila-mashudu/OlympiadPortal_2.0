// @ts-nocheck
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');
const { ForbiddenError } = require('./errors/AppError');
const { createPublicRateLimiter } = require('./middlewares/rateLimit');
require('./config/env');
require('dotenv').config();

const app = express();

// Render (and most hosts) put one proxy in front of the app. Trusting that
// hop makes req.ip the real client address, which the rate limits key on;
// otherwise every user would share the proxy's single limit.
app.set('trust proxy', 1);

// Security
const configuredFrontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = new Set(
    process.env.NODE_ENV === 'production'
        ? [configuredFrontendUrl]
        : [
              configuredFrontendUrl,
              'http://localhost:5173',
              'http://127.0.0.1:5173',
              'http://localhost:5174',
              'http://127.0.0.1:5174',
          ]
);

const isPublicApi = (path) => path === '/public' || path.startsWith('/public/');

// The public developer API is read-only data anyone may use, so any website
// may call it from the browser. It takes no cookies or tokens, so "*" is safe.
const publicCors = cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'OPTIONS'],
    maxAge: 86_400,
});
// Everything else serves signed-in users, from our own frontend only.
const appCors = cors({
    origin(origin, callback) {
        // API clients such as Postman do not send Origin; browser clients must
        // match a known application origin.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new ForbiddenError('Origin is not allowed by CORS'));
    },
    credentials: true,
});

app.use(helmet());
app.use((req, res, next) =>
    (isPublicApi(req.path) ? publicCors : appCors)(req, res, next)
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Responses carry personal data: names, answers, marks. Browsers must not
// keep them, where the next person on a shared school computer could find
// them, or serve them again after the user has logged out. (The public API,
// which holds no personal data, allows caching instead: see routes/public.js.)
app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        frontend_url:
            process.env.FRONTEND_URL || 'NOT SET (fallback: localhost:5173)',
    });
});

app.get('/', (_req, res) => {
    res.json({ message: 'Welcome to Olympiad Portal API 🏆' });
});

// ── Routes ──────────────────────────────────────────────
// Public developer API: no authentication, open to any website, and rate
// limited per client IP since there is no account to throttle
app.use('/public', createPublicRateLimiter(), require('./routes/public'));

app.use('/auth', require('./routes/auth'));
app.use('/schools', require('./routes/schools'));
app.use('/memberships', require('./routes/membershipApprovals'));
app.use('/school-invitations', require('./routes/schoolInvitations'));
app.use('/invites', require('./routes/invites'));
// /me/notifications is mounted before /me so it wins the shared prefix
app.use('/me/notifications', require('./routes/portalNotifications'));
app.use('/me', require('./routes/me'));
app.use('/educator', require('./routes/educator'));
app.use('/organiser/remarks', require('./routes/organiserRemarks'));

//registering olympiads and rounds routes
// Specific subpaths first
app.use('/olympiads', require('./routes/olympiads'));
// Review routes handle the shared remark endpoints before student round routes.
app.use('/rounds', require('./routes/reviews'));
app.use('/rounds', require('./routes/studentRounds'));
app.use('/rounds', require('./routes/studentExam'));
app.use('/rounds', require('./routes/questions'));
app.use('/rounds', require('./routes/examStatus'));
app.use('/rounds', require('./routes/submissions'));
app.use('/rounds', require('./routes/marking'));
app.use('/rounds', require('./routes/standings'));
// Root parametrised last
app.use('/rounds', require('./routes/roundDetail'));
app.use('/papers', require('./routes/papers'));

// 404
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
