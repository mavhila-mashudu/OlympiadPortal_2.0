// @ts-nocheck
const publicService = require('../services/publicService');

const getPlatformStats = async (_req, res, next) => {
    try {
        const stats = await publicService.getPlatformStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        next(err);
    }
};

const listOlympiads = async (req, res, next) => {
    try {
        const { search, year, page, limit, sort } = req.query;
        const result = await publicService.listOlympiads({
            search,
            year,
            page,
            limit,
            sort,
        });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const getOlympiadDetail = async (req, res, next) => {
    try {
        const detail = await publicService.getOlympiadDetail(
            req.params.olympiadId
        );
        res.json({ success: true, data: detail });
    } catch (err) {
        next(err);
    }
};

const getRoundResultsSummary = async (req, res, next) => {
    try {
        const { olympiadId, roundId } = req.params;
        const result = await publicService.getRoundResultsSummary(
            olympiadId,
            roundId
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const getRoundResultsBySchool = async (req, res, next) => {
    try {
        const { olympiadId, roundId } = req.params;
        const result = await publicService.getRoundResultsBySchool(
            olympiadId,
            roundId
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const getOlympiadLeaderboard = async (req, res, next) => {
    try {
        const result = await publicService.getOlympiadLeaderboard(
            req.params.olympiadId
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const listSchools = async (req, res, next) => {
    try {
        const { search, page, limit } = req.query;
        const result = await publicService.listSchools({ search, page, limit });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const getSchoolDetail = async (req, res, next) => {
    try {
        const detail = await publicService.getSchoolDetail(req.params.schoolId);
        res.json({ success: true, data: detail });
    } catch (err) {
        next(err);
    }
};

const listPapers = async (req, res, next) => {
    try {
        const { olympiad, year, page, limit } = req.query;
        // Download links are absolute, so other sites can use them as they are
        const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
        const result = await publicService.listPapers({
            olympiad,
            year,
            page,
            limit,
            baseUrl,
        });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

const downloadPaper = async (req, res, next) => {
    try {
        const url = await publicService.getPaperDownloadUrl(
            req.params.paperId,
            req.query.type || 'paper'
        );
        // The link expires in a minute, so the redirect itself must not be kept
        res.set('Cache-Control', 'no-store');
        res.redirect(302, url);
    } catch (err) {
        next(err);
    }
};

const getActivity = async (_req, res, next) => {
    try {
        const activity = await publicService.getActivity();
        res.json({ success: true, data: activity });
    } catch (err) {
        next(err);
    }
};

const getYearlyStats = async (_req, res, next) => {
    try {
        const stats = await publicService.getYearlyStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        next(err);
    }
};

const getCalendar = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const calendar = await publicService.getCalendar({ from, to });
        res.json({ success: true, data: calendar });
    } catch (err) {
        next(err);
    }
};

const getTopSchools = async (req, res, next) => {
    try {
        const { year, limit } = req.query;
        const schools = await publicService.getTopSchools({ year, limit });
        res.json({ success: true, data: schools });
    } catch (err) {
        next(err);
    }
};

const unifiedSearch = async (req, res, next) => {
    try {
        const { q } = req.query;
        const results = await publicService.unifiedSearch(q);
        res.json({ success: true, data: results });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getPlatformStats,
    listOlympiads,
    getOlympiadDetail,
    getRoundResultsSummary,
    getRoundResultsBySchool,
    getOlympiadLeaderboard,
    listSchools,
    getSchoolDetail,
    listPapers,
    downloadPaper,
    getActivity,
    getYearlyStats,
    getCalendar,
    getTopSchools,
    unifiedSearch,
};
