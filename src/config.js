const config = {
  backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:8888",
  backendPath: process.env.BACKEND_PATH || "/",
};

module.exports = config;