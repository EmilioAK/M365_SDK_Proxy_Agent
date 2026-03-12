# Proxy Agent Template (Microsoft 365 Agents SDK)

This template hosts a proxy agent built with the [Microsoft 365 Agents SDK](https://github.com/Microsoft/Agents).  
The SDK-facing app receives user messages from Teams/M365 and forwards them to your own backend agent endpoint.

## 1) What you need to set it up

### Required tools
- [Node.js](https://nodejs.org/) 18, 20, or 22
- `npm`
- [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (required for manual zip deploy and Direct Line helper script)
- Azure subscription with permissions to provision resources

### Required access
- A Microsoft 365 tenant where you can run/debug the app
- The tenant must allow custom app upload (Teams app upload enabled)
- Azure permissions to create/update:
  - Resource group
  - App Service plan + Web App
  - Managed identity
  - Azure Bot registration

### Runtime configuration
The proxy reads these environment variables from [`src/config.js`](./src/config.js):
- `BACKEND_URL` (default: `http://127.0.0.1:8000`)
- `BACKEND_PATH` (default: `/chat`)

For local debugging, toolkit environment files are used (`env/.env.*`, `.localConfigs*`).

## SDK <-> agent contract (important)

This is the integration contract between the SDK host app (`src/agent.js`) and your backend agent API.

### Request sent to your backend
- Method: `POST`
- URL: `${BACKEND_URL}${BACKEND_PATH}`
- Headers: `Content-Type: application/json`
- Body:

```json
{
  "prompt": "user message text"
}
```

### Accepted backend response formats
The proxy accepts any of the following:
1. Plain text response body
2. JSON with the first available string field:
   - `answer`
   - `result`
   - `text`
   - `content`
3. Any other JSON object (stringified before returning to the user)

### What the user sees
The proxy responds as:

```text
[<channel>] <resolved answer>
```

Channel labels are normalized:
- `msteams` -> `Teams`
- `directline` -> `Web (Direct Line)`
- `webchat` -> `Web Chat`
- `emulator` -> `Bot Framework Emulator`

### Timeout and error behavior
- Backend timeout is 8 seconds.
- On backend failure/unreachable endpoint, the user gets a fallback message.

## 2) How to get it up and running

### A) Install dependencies

```bash
npm install
```

### B) Start your backend agent service
Your backend should expose `POST /chat` (or your configured `BACKEND_PATH`).

Quick local echo backend:

```bash
node -e "require('http').createServer((req,res)=>{if(req.method==='POST'&&req.url==='/chat'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{res.statusCode=200;res.setHeader('content-type','application/json');res.end(JSON.stringify({answer:'Hello, world!'}));});}else{res.statusCode=404;res.end('not found');}}).listen(8000,()=>console.log('backend on 8000'))"
```

### C) Run the proxy locally
Use either flow:

If this is your first local CLI run, provision local dependencies first:

```bash
teamsapp provision --env local
```

1. VS Code (recommended)
   - Open the project in VS Code.
   - Press `F5`.
   - Select `Debug in Microsoft 365 Agents Playground`.
2. CLI

```bash
npm run dev:teamsfx:playground
```

In a second terminal:

```bash
npm run dev:teamsfx:launch-playground
```

## 3) How to deploy

The template's default `teamsapp deploy` flow is currently broken, so use manual zip deploy after provisioning.

### A) Provision Azure resources
Use Microsoft 365 Agents Toolkit (VS Code) or toolkit CLI provision for your target environment.

Example:

```bash
teamsapp provision --env dev
```

### B) Package the app

```bash
zip -r app.zip . -x ".git/*" ".vscode/*" "env/*" ".deployment/*" "app.zip"
```

### C) Deploy package to Azure App Service

```bash
az webapp deploy \
  --resource-group <RESOURCE_GROUP> \
  --name <WEBAPP_NAME> \
  --src-path <PATH_TO_PACKAGE> \
  --type zip
```

### D) Optional: fetch/update Direct Line secret in local env

```bash
npm run provision:directline
```

## 4) Current issues
- Streaming responses are not currently working in Teams group chats or Teams channels.
- `teamsApp/extendToM365` provisioning is currently broken and remains commented out in:
  - `m365agents.yml`
  - `m365agents.local.yml`
  - `m365agents.playground.yml`
- Default `teamsapp deploy` flow in this template is broken; use manual zip deploy.

## Project layout

| Path | Purpose |
| - | - |
| `src/index.js` | Starts the agent server |
| `src/agent.js` | Proxy logic and backend forwarding |
| `src/config.js` | Runtime backend endpoint config |
| `infra/` | Azure infrastructure templates |
| `appPackage/` | App manifest and package assets |

## Testing Web Chat with Direct Line
- For quick tests using `test-webchat.html`, place your Direct Line secret in the `SECRET` placeholder.
- Do not use that approach in production. For production guidance, see [Connect a bot to Web Chat](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-channel-connect-webchat?view=azure-bot-service-4.0&source=recommendations).

## References
- [Microsoft 365 Agents Toolkit documentation](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit samples](https://github.com/OfficeDev/TeamsFx-Samples)
