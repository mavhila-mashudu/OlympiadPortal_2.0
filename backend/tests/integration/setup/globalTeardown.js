module.exports = async () => {
    const handle = globalThis.__INTEGRATION_DB__;
    if (!handle) return;
    await handle.server.stop();
    await handle.db.close();
};
