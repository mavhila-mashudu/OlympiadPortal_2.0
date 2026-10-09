const standingsService = require('../services/standingsService');

const getStandings = async (req, res, next) => {
    try {
        const standings = await standingsService.getStandings(
            req.params.roundId,
            req.user.userId
        );
        res.json({ success: true, data: standings });
    } catch (err) {
        next(err);
    }
};

module.exports = { getStandings };
