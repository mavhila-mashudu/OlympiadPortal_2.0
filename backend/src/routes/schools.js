// @ts-nocheck
const express = require('express');
const { listSchools } = require('../controllers/authController');
const { publicAuthLimiter } = require('../middlewares/rateLimit');

const router = express.Router();

// Public: the school list that fills the signup form's dropdown. Shares the
// signup rate limit so it cannot be scraped faster than the rest of the
// public auth surface (see middlewares/rateLimit.js).
router.get('/', publicAuthLimiter, listSchools);

module.exports = router;
