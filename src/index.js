const path = require("path");
const express = require("express");
const {
  ActivityHandler,
  CloudAdapter,
  authorizeJWT,
  loadAuthConfigFromEnv,
} = require("@microsoft/agents-hosting");
const {
  agentApp,
  refreshRegistry,
  getAgentList,
  setSelectionForConversationById,
  getSelectionForConversation,
} = require("./agent");

const authConfig = loadAuthConfigFromEnv();
const server = express();

// Global middleware for JSON parsing
server.use(express.json());

// Serve the Teams tab assets
const tabAssetsPath = path.join(__dirname, "..", "public", "tab");
server.use("/tab", express.static(tabAssetsPath));

// Light-weight API for the tab
server.get("/api/agents", async (_req, res) => {
  await refreshRegistry();
  res.json({ agents: getAgentList() });
});

server.get("/api/selection", async (req, res) => {
  const { conversationId } = req.query;
  if (!conversationId) {
    return res.status(400).json({ error: "conversationId is required" });
  }

  const selection = await getSelectionForConversation(conversationId);
  res.json({ selection });
});

server.post("/api/select-agent", async (req, res) => {
  const { conversationId, agentId } = req.body || {};
  if (!conversationId || !agentId) {
    return res.status(400).json({ error: "conversationId and agentId are required" });
  }

  const selection = await setSelectionForConversationById(conversationId, agentId);
  if (!selection) {
    return res.status(404).json({ error: "Agent not found in registry" });
  }

  res.json({ selection });
});

// Bot endpoint with JWT auth
let adapter;
let headerPropagation;
if (agentApp instanceof ActivityHandler || !agentApp.adapter) {
  adapter = new CloudAdapter();
} else {
  adapter = agentApp.adapter;
  headerPropagation = agentApp?.options?.headerPropagation;
}

server.post("/api/messages", authorizeJWT(authConfig), (req, res) =>
  adapter.process(req, res, (context) => agentApp.run(context), headerPropagation)
);

const port = process.env.PORT || 3978;
server
  .listen(port, () => {
    console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId}`);
  })
  .on("error", console.error);
