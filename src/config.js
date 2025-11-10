const config = {
  backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:8000",
  backendPath: process.env.BACKEND_PATH || "/chat",
};

module.exports = config;