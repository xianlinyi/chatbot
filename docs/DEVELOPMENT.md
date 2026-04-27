# 开发文档

本文档面向后续开发者，说明这个项目的整体架构、核心数据流、模块职责、扩展入口和常用调试方式。

## 1. 项目定位

`local-agent-chatbot` 是一个本地 Agent 聊天服务：

- 前端使用 React + Vite，负责聊天 UI、流式消息展示、工具调用展示和用户补充输入。
- 后端使用 Fastify，负责 API、SSE 流、会话生命周期和静态资源托管。
- Provider 层目前只实现了 GitHub Copilot SDK，用来创建 Agent 会话、发送消息、接收工具/助手/会话事件。
- 服务不持久化聊天历史；会话只存在于内存中，页面关闭、空闲过期或服务重启都会丢失。

## 2. 技术栈与脚本

主要依赖：

- Node.js >= 20
- TypeScript + ESM
- React 19
- Vite 6
- Fastify 5
- Vitest + Testing Library
- `@github/copilot-sdk`

常用命令：

```bash
npm install
npm run dev
npm run build
npm run start
npm run test
```

开发模式下：

- `npm run dev:server` 使用 `tsx watch server/src/index.ts` 启动后端。
- `npm run dev:client` 使用 Vite 启动前端，默认地址为 `http://localhost:5173`。
- Vite 会把 `/api` 代理到 `agent.config.json` 或 `PORT` 指定的后端端口。

生产模式下：

- `npm run build:client` 输出到 `dist/client`。
- `npm run build:server` 输出到 `server/dist`。
- `npm run start` 运行 `server/dist/index.js`，并由 Fastify 同时托管 API 和前端静态文件。

## 3. 目录结构

```text
.
├── agent.config.json          # 本地 Agent、Provider、服务端口等配置
├── client/                    # React 前端
│   ├── index.html
│   └── src/
│       ├── App.tsx            # 前端状态机和聊天主流程
│       ├── api.ts             # 浏览器端 API/SSE 客户端
│       ├── types.ts           # 前端事件和响应类型
│       ├── chat/              # 聊天事件、token 统计等纯逻辑
│       └── components/        # UI 组件
├── server/
│   ├── src/
│   │   ├── index.ts           # 后端启动入口
│   │   ├── app.ts             # Fastify app 装配
│   │   ├── config/            # 配置类型、加载、校验
│   │   ├── providers/         # AgentProvider 抽象与 GitHub Copilot 实现
│   │   ├── routes/            # HTTP/SSE API
│   │   ├── sessions/          # 内存会话管理
│   │   └── utils/             # 日志脱敏
│   └── test/                  # 后端测试
├── Dockerfile
├── docker-compose.yml
└── vite.config.ts
```

## 4. 启动链路

后端启动入口是 `server/src/index.ts`：

1. `loadConfig()` 读取并合并 `agent.config.json`、默认配置和环境变量。
2. `createProvider(config)` 创建当前 Provider，目前只支持 `github-copilot`。
3. `buildApp({ config, provider })` 装配 Fastify、CORS、API 路由、静态资源和会话管理。
4. 启动前会打印已脱敏的 Agent 信息。
5. 收到 `SIGINT` 或 `SIGTERM` 时关闭 Fastify、会话和 Provider。

Fastify 装配入口是 `server/src/app.ts`：

- 创建 `SessionManager` 并启动空闲清理定时器。
- 注册 CORS。
- 注册 `/api/*` 路由。
- 如果存在 `dist/client/index.html`，注册静态文件托管。
- 非 API 路由在生产构建存在时回退到前端 `index.html`，方便单页应用刷新。

## 5. 配置模型

配置类型定义在 `server/src/config/types.ts`，加载逻辑在 `server/src/config/loadConfig.ts`。

配置来源优先级：

1. 内置默认配置。
2. 仓库根目录的 `agent.config.json`。
3. 环境变量覆盖部分字段：
   - `PORT`
   - `HOST`
   - `AGENT_PROVIDER`
   - `COPILOT_MODEL`

当前 Provider 只支持：

```json
{
  "provider": {
    "name": "github-copilot"
  }
}
```

鉴权配置要点：

- 当 `provider.auth.useLoggedInUser` 为 `false` 时，必须配置 `provider.auth.token`。
- `provider.auth.githubToken` 仍被兼容读取，但已标记为 deprecated。
- 支持的 `tokenType`：
  - `fine-grained-pat`
  - `copilot-cli-oauth`
  - `github-cli-oauth`
- 经典 `ghp_` GitHub PAT 会被拒绝，因为 GitHub Copilot SDK 不支持这种鉴权方式。

## 6. 后端 API

API 注册在 `server/src/routes/api.ts`。

### `GET /api/health`

返回服务健康状态和当前内存会话数量。

```json
{
  "ok": true,
  "activeSessions": 1
}
```

### `GET /api/agent-info`

返回前端初始化需要的应用信息和 Agent 信息。返回前会调用 `redactSecrets()` 脱敏。

### `POST /api/messages`

请求体：

```json
{
  "sessionId": "optional-existing-id",
  "message": "用户消息"
}
```

行为：

- `message` 必须是非空字符串。
- 没有 `sessionId` 或会话已失效时，后端会懒创建新会话。
- 响应类型是 `text/event-stream`。
- 第一帧总是 `session`，用于告诉前端活跃 `sessionId`。
- 后续帧来自 Provider 的 `AsyncIterable<AgentStreamEvent>`。

### `POST /api/prompts`

用于在已有 Agent 正在运行时追加用户指令。

请求体：

```json
{
  "sessionId": "active-session-id",
  "message": "继续补充的指令"
}
```

后端会调用 `SessionManager.enqueuePrompt()`，再转发到 Provider 的 `session.send({ mode: "enqueue" })`。

### `POST /api/user-input`

用于回答 Agent 发起的用户输入请求。

请求体：

```json
{
  "sessionId": "active-session-id",
  "requestId": "input-request-id",
  "answer": "用户答案",
  "wasFreeform": true
}
```

### `POST /api/stop`

请求体可带 `sessionId`：

```json
{
  "sessionId": "active-session-id"
}
```

- 带 `sessionId` 时只关闭该会话。
- 不带 `sessionId` 时调用 `provider.stop()`，停止所有 Provider 资源。

## 7. SSE 事件模型

后端统一使用 `server/src/routes/sse.ts` 写 SSE：

```text
event: <event.type>
data: <JSON.stringify(event)>

```

事件联合类型定义在 `server/src/providers/types.ts`：

- `session`：通知前端当前会话 ID。
- `delta`：普通文本增量。当前 Copilot Provider 主要透传 `copilot_event`，前端也支持这种通用文本增量。
- `copilot_event`：直接透传 Copilot SDK 原始事件。
- `assistant_event`：助手事件。
- `session_event`：会话生命周期事件。
- `tool`：工具调用事件。
- `input_request`：Agent 需要用户回答。
- `done`：本轮结束。
- `error`：本轮出错。

前端的 `client/src/api.ts` 通过 `ReadableStream` 读取 SSE，按空行切分帧，再解析 `data:` 行为 `StreamEvent`。

## 8. 会话管理

会话管理在 `server/src/sessions/sessionManager.ts`。

职责：

- 创建会话并保存 `{ id, createdAt, lastSeenAt }`。
- 每次读取会话时刷新 `lastSeenAt`。
- 把消息发送、补充 prompt、用户输入回答转发给 Provider。
- 删除会话时调用 `provider.closeSession(sessionId)`。
- 默认空闲 TTL 是 10 分钟。
- `startCleanup()` 默认每 60 秒清理一次过期会话。

注意：聊天内容不保存在 `SessionManager`，真实上下文由 Provider/SDK 会话持有。

## 9. Provider 抽象

Provider 接口定义在 `server/src/providers/types.ts`：

```ts
export interface AgentProvider {
  getInfo(): AgentInfo;
  createSession(): Promise<AgentSession>;
  sendMessageStream(sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent>;
  enqueuePrompt(sessionId: string, prompt: string): Promise<boolean>;
  respondToUserInput(sessionId: string, requestId: string, answer: string, wasFreeform: boolean): Promise<boolean>;
  closeSession(sessionId: string): Promise<void>;
  stop(): Promise<void>;
}
```

如果后续要接入新 Provider，建议步骤：

1. 在 `server/src/config/types.ts` 扩展 `provider.name` 类型和配置结构。
2. 在 `server/src/providers/` 新增 Provider 实现，遵守 `AgentProvider` 接口。
3. 在 `server/src/providers/createProvider.ts` 增加分支。
4. 按现有 `MockAgentProvider` 模式补 API 和会话测试。
5. 确认前端是否能直接消费新 Provider 的事件；如果事件结构不同，需要在后端转换成现有 `AgentStreamEvent`。

## 10. GitHub Copilot Provider

实现文件是 `server/src/providers/githubCopilotProvider.ts`。

核心状态：

- `sessions`：`sessionId -> CopilotSession`
- `activeRuns`：当前正在流式返回的运行，用于把 SDK 回调事件推入异步队列。
- `pendingUserInputs`：等待用户回答的输入请求。
- `clientPromise`：懒初始化 Copilot SDK client。
- `authPreflightPromise`：启动 SDK 并调用 `listModels()` 做鉴权预检。

创建会话时传给 Copilot SDK 的关键参数：

- `sessionId`
- `model`
- `streaming: true`
- `systemMessage`，内容来自 `provider.instructions`
- `customAgents`
- `skillDirectories`
- `disabledSkills`
- `mcpServers`
- `onPermissionRequest: async () => ({ kind: "approved" })`
- `onUserInputRequest`

发送消息时：

1. 校验 `sessionId` 是否存在。
2. 创建 `AsyncQueue<AgentStreamEvent>`。
3. 订阅 SDK 事件。
4. 调用 `session.sendAndWait({ prompt }, RESPONSE_IDLE_TIMEOUT_MS)`。
5. SDK 事件被推为 `copilot_event`。
6. 成功完成时推 `done` 并关闭队列。
7. 出错时推 `error` 并关闭队列。

`enqueuePrompt()` 只对活跃运行生效；如果没有 `activeRuns`，会返回 `false`。

用户输入流程：

1. SDK 调用 `onUserInputRequest`。
2. Provider 生成 `requestId`，向当前运行队列推 `input_request`。
3. Provider 保存一个 Promise resolver 到 `pendingUserInputs`。
4. 前端调用 `/api/user-input`。
5. Provider 找到 resolver 并 resolve，SDK 继续执行。

## 11. 前端主流程

前端入口是 `client/src/main.tsx`，主状态机在 `client/src/App.tsx`。

关键状态：

- `agentInfo`：页面初始化时从 `/api/agent-info` 获取。
- `sessionId`：后端 SSE 的 `session` 帧返回后写入。
- `messages`：前端聊天消息数组，只存在浏览器内存。
- `draft`：输入框文本。
- `isSending`：是否有正在运行的 Agent 请求。
- `pendingInputRequest`：Agent 当前等待用户回答的问题。
- `answeredInputRequestIds`：避免重复提交选择。
- `tokenUsage`：从 `assistant.usage` 事件累加。

发送首条或普通消息：

1. 用户提交表单。
2. 前端追加一条 user 消息和一条 streaming assistant 消息。
3. 调用 `sendMessage(sessionId, prompt, signal)`。
4. `for await` 消费 SSE 事件。
5. 按事件类型更新消息内容、事件列表、token 用量或待回答问题。
6. 收到 `done` 后把 assistant 消息标记为 `done`。

运行中追加指令：

- 当 `isSending` 为 true 且输入框有内容时，提交会调用 `enqueuePrompt(sessionId, prompt)`。
- UI 会追加一条 user 消息，但不会新建 assistant 消息。

停止运行：

- 当 `isSending` 为 true 且输入框为空时，发送按钮变为停止按钮。
- 停止时 abort 当前请求、调用 `/api/stop`，并把当前 assistant 内容追加 `Abort`。

页面关闭：

- `pagehide` 和 `beforeunload` 会触发 `stopSessionOnPageExit(sessionId)`。
- 优先使用 `navigator.sendBeacon`，否则使用 `fetch(..., keepalive: true)`。

## 12. 前端事件渲染

核心组件：

- `client/src/components/MessageList.tsx`：消息列表、用户消息折叠、复制按钮。
- `client/src/components/ContentRenderer.tsx`：把 Agent 事件解析为可渲染 block/turn。
- `client/src/components/ToolExecutionBlock.tsx`：工具调用详情展示。
- `client/src/components/LiquidGlassInput.tsx`：输入框容器和视觉效果。
- `client/src/components/ChatHeader.tsx`：顶部状态、主题切换。

`ContentRenderer` 的解析思路：

- `assistant.turn_start` 创建一个 `Turn`。
- `assistant.turn_end` 结束当前 `Turn`。
- `assistant.message_delta` 和 `assistant.message` 生成可见 markdown 文本。
- `assistant.message` 内的 `toolRequests` 会被解析，尤其会识别 `ask_user`。
- `input_request` 生成选择卡或自由输入卡。
- `tool.execution_start`、`tool.execution_progress`、`tool.execution_partial_result`、`tool.execution_complete` 聚合成工具调用块。
- `session.*` 事件会被格式化成简短系统消息。

工具调用展示规则：

- 普通工具显示为可折叠详情块。
- 运行中工具默认展开。
- 完成后的工具 turn 默认折叠。
- `ask_user` 会显示“正在询问用户/询问用户”状态，并把真实交互卡片展示在外层。
- synthetic `ask_user` 卡片会在后续真实 `input_request` 到达时去重。

## 13. Token 用量统计

逻辑在 `client/src/chat/tokenUsage.ts`。

- 只消费 `assistant.usage` 事件。
- 根据 `apiCallId` 和 `providerCallId` 生成去重 key，避免同一 usage 被重复累加。
- 统计字段：
  - `inputTokens`
  - `outputTokens`
  - `cacheReadTokens`
  - `cacheWriteTokens`
- UI 展示格式类似：`Tokens 150 · In 100 · Out 50 · Cache 20`。

## 14. 测试地图

测试入口是 `npm run test`，Vitest 配置在 `vitest.config.ts`。

后端测试：

- `server/test/api.test.ts`
  - 请求校验。
  - 懒创建 session。
  - SSE 帧顺序。
  - Agent 信息脱敏。
  - 用户输入回答。
  - 运行中追加 prompt。
  - 停止 session。
- `server/test/sessionManager.test.ts`
  - 创建、读取、过期、删除会话。
- `server/test/loadConfig.test.ts`
  - 配置合并、环境变量覆盖、鉴权校验。
- `server/test/copilotResponseParser.test.ts`
  - Copilot 事件解析辅助函数。
- `server/test/redact.test.ts`
  - secret 字段脱敏。

前端测试：

- `client/src/App.test.tsx`
  - 初始化 Agent 信息。
  - 发送消息与流式响应。
  - 页面关闭时停止会话。
  - 流式运行中停止按钮。
  - 用户输入请求和追加 prompt 等交互。
- `client/src/components/ContentRenderer.test.tsx`
  - turn 状态标签。
  - 工具调用折叠/展开。
  - `ask_user` 渲染、去重、选择和自由输入。
- `client/src/assistantEventFilter.test.tsx`
  - 助手事件过滤相关逻辑。

## 15. 常见开发任务

### 修改 API

1. 先改 `server/src/routes/api.ts`。
2. 如涉及请求体，补充或复用 `server/src/routes/requestValidation.ts`。
3. 如涉及前端调用，更新 `client/src/api.ts` 和 `client/src/types.ts`。
4. 添加或更新 `server/test/api.test.ts`。

### 修改 Agent 事件展示

1. 先确认事件来自后端哪种 `AgentStreamEvent`。
2. 如只是前端展示变化，优先改 `client/src/components/ContentRenderer.tsx`。
3. 如要调整分类，改 `client/src/chat/displayEvents.ts`。
4. 更新 `client/src/components/ContentRenderer.test.tsx`。

### 接入新的 Copilot 事件

1. 如果事件可直接透传，前端在 `App.tsx` 的 `copilot_event` 分支处理即可。
2. 如果事件需要稳定抽象，后端应转换成 `assistant_event`、`session_event`、`tool` 或新增事件类型。
3. 新增事件类型时要同步更新：
   - `server/src/providers/types.ts`
   - `client/src/types.ts`
   - `client/src/App.tsx`
   - 相关渲染组件和测试

### 新增配置项

1. 更新 `server/src/config/types.ts`。
2. 更新 `defaultConfig`。
3. 更新 `mergeConfig()`。
4. 如需要校验，更新 `validateAuthConfig()` 或新增校验函数。
5. 更新 `README.md` 和本文档。
6. 补 `server/test/loadConfig.test.ts`。

### 调整 UI

1. 先看 `client/src/styles.css` 和目标组件旁边的 CSS。
2. 保持消息列表、工具详情、输入框三个区域职责清晰。
3. 涉及交互状态时优先补 Testing Library 测试。
4. 如改动流式渲染，重点检查：
   - 长消息折叠。
   - `input_request` 是否还能回答。
   - 工具调用完成后是否正确折叠。
   - token 用量是否重复累加。

## 16. 日志与调试

后端：

- Fastify 日志级别通过 `LOG_LEVEL` 控制，默认 `info`。
- Copilot Provider 使用 `console.info` 和 `console.error`，前缀为 `[github-copilot-provider]`。
- 启动日志会输出 Provider、模型、instructions、custom agents、skills、MCP servers、权限和持久化状态，并对敏感字段脱敏。

前端：

- SSE 解析集中在 `client/src/api.ts`。
- 主状态更新集中在 `client/src/App.tsx` 的 `for await (const event of sendMessage(...))` 循环。
- 若 UI 没有显示预期内容，优先检查：
  - 后端 SSE 是否实际发出了事件。
  - `StreamEvent` 类型是否覆盖该事件。
  - `App.tsx` 是否把事件 append 到 assistant 消息。
  - `ContentRenderer` 是否把事件解析成 block。

## 17. 已知设计约束

- 当前只有一个 Provider：`github-copilot`。
- 当前权限请求固定自动批准：`onPermissionRequest: async () => ({ kind: "approved" })`。
- 会话和聊天历史都是内存态，没有数据库或本地持久化。
- `SessionManager` 默认 10 分钟空闲过期。
- `/api/prompts` 只接受活跃运行中的会话；运行结束后追加会返回 404。
- Docker 镜像会把构建时的 `agent.config.json` 复制进镜像；生产部署如果要替换 token，建议挂载配置文件或调整部署方式，避免把敏感 token 烘进镜像。

## 18. 推荐后续改进

- 增加 `.env` 或环境变量方式注入 Copilot token，避免敏感信息写入 `agent.config.json`。
- 给 Provider 事件做后端归一化，减少前端直接理解 Copilot SDK 原始事件。
- 把 `App.tsx` 中的流式状态机拆成 hook，例如 `useChatSession()`。
- 为会话历史增加可选持久化层。
- 把 Provider 日志接入 Fastify logger，统一日志格式和级别。
- 给 `/api/messages` 增加并发保护，明确同一 session 多个流式请求的处理策略。
