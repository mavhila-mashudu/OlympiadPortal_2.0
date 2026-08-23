const app = require("./src/app");
const roundLifecycleJob = require("./src/jobs/roundLifecycleJob");

const PORT = process.env.PORT || 3000;

//start the server - request listener
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  roundLifecycleJob.start();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  roundLifecycleJob.stop();
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

module.exports = server;
