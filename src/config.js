const config = {
  // Pointing to your node one-liner registry on port 3000
  agentRegistryUrl: process.env.AGENT_REGISTRY_URL || "http://127.0.0.1:3000/agents",
};

module.exports = config;