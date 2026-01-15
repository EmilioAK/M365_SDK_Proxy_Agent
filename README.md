# Overview of the Proxy Agent

This app template is built on top of [Microsoft 365 Agents SDK](https://github.com/Microsoft/Agents).
It showcases a simple proxy agent, which simply forwards messages between Teams/M365 and your own agent endpoint

## Get started with the template

> **Prerequisites**
>
> To run the template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 18, 20, 22.
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) latest version or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli).

> For local debugging using Microsoft 365 Agents Toolkit CLI, you need to do some extra steps described in [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
1. Press F5 to start debugging which launches your agent in Microsoft 365 Agents Playground using a web browser. Select `Debug in Microsoft 365 Agents Playground`.
1. You can send any message to get a response from the agent.

> You also need to have some sort of backend running. Here is a simple example that just echos "Hello, World!" back to the agent:
```
node -e "require('http').createServer((req,res)=>{if(req.method==='POST'&&req.url==='/chat'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{res.statusCode=200;res.setHeader('content-type','application/json');res.end(JSON.stringify({answer:'Hello, world!'}));});}else{res.statusCode=404;res.end('not found');}}).listen(8000,()=>console.log('backend on 8000'))"
```

> Backend example for the Agent Picker
```
node -e "require('http').createServer((req,res)=>{if(req.method==='GET'&&req.url==='/agents'){res.statusCode=200;res.setHeader('content-type','application/json');res.end(JSON.stringify([{id:'legal',name:'Legal Agent',url:'http://127.0.0.1:8000'},{id:'ops',name:'Ops Agent',url:'http://127.0.0.1:8000'},{id:'dev',name:'Dev Agent',url:'http://127.0.0.1:8000'}]));}else{res.statusCode=404;res.end('not found');}}).listen(3000,()=>console.log('registry on 3000'))"
```

**Congratulations**! You are running an agent that can now interact with users in Microsoft 365 Agents Playground:

![Basic AI Agent](https://github.com/user-attachments/assets/984af126-222b-4c98-9578-0744790b103a)

## What's included in the template

| Folder       | Contents                                            |
| - | - |
| `.vscode`    | VSCode files for debugging                          |
| `appPackage` | Templates for the application manifest        |
| `env`        | Environment files                                   |
| `infra`      | Templates for provisioning Azure resources          |
| `src`        | The source code for the application                 |

The following files can be customized and demonstrate an example implementation to get you started.

| File                                 | Contents                                           |
| - | - |
|`src/index.js`| Sets up the agent server.|
|`src/config.js`| Defines the environment variables.|
|`src/agent.js`| Handles business logics for the Proxy Agent.|

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                                 | Contents                                           |
| - | - |
|`m365agents.yml`|This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things:  Properties and configuration Stage definitions. |
|`m365agents.local.yml`|This overrides `m365agents.yml` with actions that enable local execution and debugging.|
|`m365agents.playground.yml`| This overrides `m365agents.yml` with actions that enable local execution and debugging in Microsoft 365 Agents Playground.|

## Testing Web Chat with Direct Line

- For quick tests using `test-webchat.html`, add your Direct Line secret into the `SECRET` placeholder in the HTML so the sample page can fetch a token.
- Do not use this approach in production—never expose a Direct Line secret in client code. For production, follow the guidance in [Connect a bot to Web Chat](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-channel-connect-webchat?view=azure-bot-service-4.0&source=recommendations), which uses your own backend to obtain tokens securely.

## Additional information and references

- [Microsoft 365 Agents Toolkit Documentations](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit Samples](https://github.com/OfficeDev/TeamsFx-Samples)

## Known issues
- The agent is currently not working in any Teams group chats or Teams channels when the stream response is enabled.
- The provisioning for `teamsApp/extendToM365` inside the yaml files (`m365agents.yml`, `m365agents.local.yml` and `m365agents.playground.yml`) is currently broken, so its commented out
- The default deployment is also broken. You can deploy manually using a command like this:
```
zip -r app.zip . -x ".git/*" ".vscode/*" "env/*" ".deployment/*" "app.zip"
```
```
az webapp deploy \
  --resource-group <RESOURCE_GROUP> \
  --name <WEBAPP_NAME> \
  --src-path <PATH_TO_PACKAGE> \
  --type zip
```
