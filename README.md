# Proxy Agent Template

A simple proxy agent built on the [Microsoft 365 Agents SDK](https://github.com/Microsoft/Agents). It forwards messages from Teams/M365 to a selected backend agent endpoint.

## 1. What you need to set it up

### Required tools

- [Node.js](https://nodejs.org/) (supported: 18, 20, 22)
- npm
- One of the following:
  - [Microsoft 365 Agents Toolkit VS Code Extension](https://aka.ms/teams-toolkit)
  - [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)

### Required access/config

- Azure subscription and permissions to provision/deploy resources
- Microsoft 365/Teams tenant where custom app upload is allowed
- Account with permission to upload/publish Teams apps in that tenant
- Local bot credentials (`clientId` and `clientSecret`)
- Agent registry endpoint that returns `[{ id, name, url }]` (or use the local demo below)

### Install dependencies

```bash
npm install
```

---

## 2. How to get it up and running

### Option A: Run with Microsoft 365 Agents Toolkit (recommended)

1. Open the project in VS Code.
2. Select the Microsoft 365 Agents Toolkit icon in the left sidebar.
3. Press `F5`.
4. Choose `Debug in Microsoft 365 Agents Playground`.
5. Send a message and select an agent by typing its number.

For local debugging with CLI, follow: [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

### Option B: Minimal local multi-agent demo (agent picker)

Run these in separate terminals:

1. Start `Legal Agent` on port `8001`:

```bash
node -e "const http=require('http');const name='Legal Agent';const port=8001;http.createServer((req,res)=>{if(req.method==='POST'&&req.url==='/chat'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{let prompt='';try{prompt=JSON.parse(b||'{}').prompt||'';}catch{}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({answer:name+' handled: '+prompt}));});return;}res.writeHead(404);res.end('not found');}).listen(port,()=>console.log(name+' on '+port));"
```

2. Start `Ops Agent` on port `8002`:

```bash
node -e "const http=require('http');const name='Ops Agent';const port=8002;http.createServer((req,res)=>{if(req.method==='POST'&&req.url==='/chat'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{let prompt='';try{prompt=JSON.parse(b||'{}').prompt||'';}catch{}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({answer:name+' handled: '+prompt}));});return;}res.writeHead(404);res.end('not found');}).listen(port,()=>console.log(name+' on '+port));"
```

3. Start the registry on port `3000`:

```bash
node -e "const http=require('http');http.createServer((req,res)=>{if(req.method==='GET'&&req.url==='/agents'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify([{id:'legal',name:'Legal Agent',url:'http://127.0.0.1:8001'},{id:'ops',name:'Ops Agent',url:'http://127.0.0.1:8002'}]));return;}res.writeHead(404);res.end('not found');}).listen(3000,()=>console.log('registry on 3000'));"
```

4. Start the proxy app:

```bash
AGENT_REGISTRY_URL=http://127.0.0.1:3000/agents npm run dev
```

5. In chat, send any message, choose `1` or `2`, and subsequent messages are routed to that backend. Send `switch` to clear selection.

---

## Integration contracts

### Registry contract (between registry and this proxy)

This project reads the registry from `AGENT_REGISTRY_URL` (default: `http://127.0.0.1:3000/agents`) using:

- Method: `GET`
- Success response: `200` with a JSON array (not wrapped in an object)

Expected shape:

```json
[
  { "id": "legal", "name": "Legal Agent", "url": "http://127.0.0.1:8001" },
  { "id": "ops", "name": "Ops Agent", "url": "http://127.0.0.1:8002" }
]
```

Field notes:

- `id`: recommended and should be stable/unique
- `name`: required (display name in picker)
- `url`: required absolute base URL for the backend agent
- Additional fields are ignored by the proxy

### Agent contract (between backend agents and this proxy)

After an agent is selected, the proxy sends user messages to the selected agent at:

- Method: `POST`
- URL: `<agent.url>/chat`
- Headers: `Content-Type: application/json`
- Body:

```json
{ "prompt": "user message text" }
```

Response handling:

- String response: used directly
- Object response: proxy prefers `answer`, then `result`, then `content`
- Other response types: converted to string
- Timeout: 8 seconds (request timeout from proxy to backend agent)

If the call fails, the proxy sends an error message back to the user in chat.

---

## 3. How to deploy

### Standard Teams Toolkit flow

Use the normal workflow first:

```bash
teamsapp provision --env dev
teamsapp deploy --env dev
teamsapp publish --env dev
```

### Manual deployment workaround (currently needed)

Default deployment is currently broken in this template. Use zip deploy instead:

1. Package the app:

```bash
zip -r app.zip . -x ".git/*" ".vscode/*" "env/*" ".deployment/*" "app.zip"
```

2. Deploy to Azure App Service:

```bash
az webapp deploy \
  --resource-group <RESOURCE_GROUP> \
  --name <WEBAPP_NAME> \
  --src-path <PATH_TO_PACKAGE> \
  --type zip
```

---

## 4. Current issues

- The agent currently does not work in Teams group chats or Teams channels when stream response is enabled.
- Provisioning step `teamsApp/extendToM365` is currently broken in `m365agents.yml`, `m365agents.local.yml`, and `m365agents.playground.yml` (currently commented out).
- Default template deployment is currently broken; use the manual zip deploy workaround above.

---

## Testing web chat with Direct Line

- For quick tests using `test-webchat.html`, add your Direct Line secret into the `SECRET` placeholder in the HTML.
- Do not use this in production. Never expose a Direct Line secret in client code.
- For production guidance, see [Connect a bot to Web Chat](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-channel-connect-webchat?view=azure-bot-service-4.0&source=recommendations).

## Project structure

| Folder | Contents |
| - | - |
| `.vscode` | VSCode files for debugging |
| `appPackage` | Templates for the application manifest |
| `env` | Environment files |
| `infra` | Templates for provisioning Azure resources |
| `src` | Application source code |

| File | Contents |
| - | - |
| `src/index.js` | Sets up the agent server |
| `src/config.js` | Defines environment variables |
| `src/agent.js` | Handles proxy-agent business logic |

| Toolkit file | Purpose |
| - | - |
| `m365agents.yml` | Main project file with provision/deploy/publish stages |
| `m365agents.local.yml` | Local override for local execution/debugging |
| `m365agents.playground.yml` | Playground override for local execution/debugging |

## Additional references

- [Microsoft 365 Agents Toolkit Documentation](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit Samples](https://github.com/OfficeDev/TeamsFx-Samples)
