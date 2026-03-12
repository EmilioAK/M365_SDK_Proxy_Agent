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
  setSelectionForUserById,
  getSelectionForUser,
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
  const { conversationId, userId } = req.query;
  if (!conversationId && !userId) {
    return res.status(400).json({ error: "conversationId or userId is required" });
  }

  const selection =
    (conversationId && (await getSelectionForConversation(conversationId))) ||
    (userId && (await getSelectionForUser(userId)));
  res.json({ selection });
});

server.post("/api/select-agent", async (req, res) => {
  const { conversationId, userId, agentId } = req.body || {};
  if (!agentId || (!conversationId && !userId)) {
    return res
      .status(400)
      .json({ error: "agentId is required, plus either conversationId or userId" });
  }

  let selection = null;
  if (conversationId) {
    selection = await setSelectionForConversationById(conversationId, agentId);
  }
  if (!selection && userId) {
    selection = await setSelectionForUserById(userId, agentId);
  }

  if (!selection) {
    return res.status(404).json({ error: "Agent not found in registry" });
  }

  // Keep user selection in sync when both identifiers are present
  if (selection && userId && conversationId) {
    await setSelectionForUserById(userId, agentId);
    await setSelectionForConversationById(conversationId, agentId);
  }

  res.json({ selection, appliedTo: { conversationId, userId } });
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
