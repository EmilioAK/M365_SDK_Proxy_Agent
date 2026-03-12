/**
 * Mock Snowflake Agent (port 8002)
 * Returns AG-UI models so the proxy can render channel-specific Adaptive Cards.
 *
 * Responds to /chat POST with text + aguiUi only.
 */

const http = require("http");

const QUERIES = [
  {
    id: "q-daily-active",
    label: "Daily Active Users",
    query: "SELECT DATE(ts), COUNT(DISTINCT user_id) FROM events GROUP BY 1 ORDER BY 1 DESC LIMIT 7",
    rowCount: 7,
  },
  {
    id: "q-revenue",
    label: "Monthly Revenue",
    query: "SELECT DATE_TRUNC('month', created_at), SUM(amount) FROM orders GROUP BY 1",
    rowCount: 12,
  },
  {
    id: "q-top-tables",
    label: "Top Tables by Size",
    query: "SELECT table_name, row_count FROM information_schema.tables ORDER BY row_count DESC LIMIT 5",
    rowCount: 5,
  },
];

function buildAguiUi(prompt) {
  return {
    kind: "choice-list",
    title: "Snowflake: Saved Queries",
    description: "Select a query to run against the data warehouse:",
    defaultEventType: "agent:snowflake:queryResult",
    choices: QUERIES.map((q) => ({
      id: q.id,
      label: `Run: ${q.label}`,
      description: `${q.rowCount} rows`,
      eventType: "agent:snowflake:queryResult",
      payload: {
        query: q.query,
        queryId: q.id,
        rowCount: q.rowCount,
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
        text: `Snowflake Agent received: *"${prompt}"*`,
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

server.listen(8002, () => console.log("Snowflake mock agent on http://127.0.0.1:8002"));
