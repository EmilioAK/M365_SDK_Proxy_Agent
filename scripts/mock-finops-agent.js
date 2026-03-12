/**
 * Mock FinOps Agent (port 8001)
 * Returns AG-UI models so the proxy can render channel-specific Adaptive Cards.
 *
 * Responds to /chat POST with text + aguiUi only.
 */

const http = require("http");

const RESOURCES = [
  { id: "db-prod", name: "Production DB", cost: "$5,200/mo" },
  { id: "vms-dev", name: "Development VMs", cost: "$820/mo" },
  { id: "storage-archive", name: "Archive Storage", cost: "$340/mo" },
];

function buildAguiUi(prompt) {
  return {
    kind: "choice-list",
    title: "FinOps: Resource Cost Overview",
    description: "Select a resource to analyze savings opportunities:",
    defaultEventType: "agent:finops:selectResource",
    choices: RESOURCES.map((r) => ({
      id: r.id,
      label: `Analyze ${r.name}`,
      description: r.cost,
      eventType: "agent:finops:selectResource",
      payload: {
        resourceId: r.id,
        resourceName: r.name,
        resourceCost: r.cost,
        sourcePrompt: prompt,
      },
    })),
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let prompt = "...";
      try {
        prompt = JSON.parse(body).prompt || "...";
      } catch (_) {}

      const aguiUi = buildAguiUi(prompt);
      const response = {
        text: `FinOps Agent received: *"${prompt}"*`,
        aguiUi,
      };
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    });
  } else {
    res.statusCode = 404;
    res.end("not found");
  }
});

server.listen(8001, () => console.log("FinOps mock agent on http://127.0.0.1:8001"));
