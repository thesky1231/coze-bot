# Coze Chat SDK H5（Netlify 部署版）

## 先判断：当前限制下最合理的方案

在“没有公众号/小程序主体、希望尽量不做复杂后端、至少支持 3 人使用、要能快速上线”的前提下，最合理的正式方案是：

### 推荐方案

`Coze Chat SDK + Netlify Functions + 浏览器朗读（Web Speech API）`

原因：

1. 纯静态页面如果前端写死 PAT，只适合演示，不适合多人正式使用
2. 你没有微信服务号、小程序主体，不适合先走更重的微信生态接入
3. Netlify Functions 足够轻，不需要你自己维护完整后端
4. Coze Chat SDK 可以最快复用现有智能体能力，最容易交付
5. 语音“绝对全自动播报”会被浏览器自动播放策略限制，最现实可用的交互是：
   - 第一次点一次“开启朗读”
   - 后续尽量自动播报
   - 如果没自动播报，再点“朗读上一条”

## 方案对比

| 方案 | 上线速度 | 多人正式使用 | 安全性 | 语音体验 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 纯静态方案 | 很快 | 不适合 | 低，前端不能写死 PAT | 只能做很有限的页面朗读 | 只适合演示或备用 |
| 最小 serverless 方案 | 快 | 适合 | 高，敏感信息放在服务端 | 能做到“先点一次开启朗读，后面尽量自动播报” | 最推荐 |

### 纯静态方案

优点：

- 部署最简单
- 几乎零后端

缺点：

- PAT 不能安全放到前端
- 不能作为正式交付版本
- 多人长期使用不稳妥

### 最小 serverless 方案

优点：

- 后端极小，只需要一个 Netlify Function
- 前端不暴露 PAT 和私钥
- 支持多人访问，会话隔离清晰
- 仍然保留 Coze Chat SDK 的接入速度

缺点：

- 比纯静态多一步环境变量配置
- UI 依旧受 Chat SDK 本身限制，不如完全自定义聊天界面
- 语音自动播报只能做“最接近需求”的方案，不能保证所有浏览器都 100% 全自动

## 明确推荐

推荐你现在就用：

### `最小 serverless 方案`

这就是本项目当前已经实现的版本。

如果以后还要继续升级，再做第二阶段：

- 改成自定义聊天界面
- 直接调用 Coze 对话 API
- 获得更大的字体、消息气泡、语音按钮与提示文案控制权

第一版不建议先上复杂全栈。

## 当前项目已经实现了什么

### 1. 老人友好页面

当前首页已经改成：

- 大标题
- 大按钮
- 少提示
- 打开就进入聊天页

页面上保留的操作很少，只有几个最关键按钮：

- `开启朗读`
- `朗读上一条`
- `备用入口`
- `重新连接`（仅出错时出现）

### 2. 多人会话隔离

页面会：

1. 从 `localStorage` 读取 `site_user_id`
2. 如果没有，就自动生成一个新的 `u_xxx`
3. 请求 `/.netlify/functions/coze-token?uid=<site_user_id>`
4. 使用返回的 token 初始化 Coze Chat SDK
5. 同时把 `site_user_id` 写到 `session_name`

因此不同设备、不同浏览器、不同无痕窗口都会得到不同会话标识，满足至少 3 人使用没有问题。

### 3. 语音交互

当前实现采用的是最现实可用的设计：

1. 第一次先点一次 `开启朗读`
2. 后面新回复会尽量自动读出来
3. 如果自动没成功，再点 `朗读上一条`

这比“每次找很小的播放按钮”更适合老人。

### 4. 备用入口

如果你有 Coze 商店链接，可以把它填到 `index.html` 顶部的：

```html
<meta name="coze-store-url" content="">
```

填完后页面就会出现明显的 `备用入口` 按钮。

## 为什么语音不能保证真正全自动

这里需要明确：

- 浏览器会限制未经用户交互就自动发声
- Coze Chat SDK 并没有提供一个稳定、官方、通用的“每条新回复都自动触发本地 TTS”的标准回调接口

所以当前实现是一个“最接近需求、可实际交付”的工程化方案，而不是承诺所有设备都能绝对全自动。

### 当前采用的现实替代方案

- 第一次先点一次“开启朗读”
- 后续尽量自动播报
- 自动播报不成功时，再点“朗读上一条”

## 参考依据

- Coze Studio Chat SDK Wiki：说明了 `WebChatClient` 的基本配置方式，以及开源版 ChatSDK 不支持语音播放、语音录制、语音通话  
  https://github.com/coze-dev/coze-studio/wiki/8.-Chat-SDK
- MDN Autoplay Guide：带声音的自动播放通常会被浏览器阻止，用户交互后才更可能放行  
  https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN SpeechSynthesis：浏览器提供网页朗读能力，可作为“老人听语音”的最小实现  
  https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

## 当前项目前端可直接改的 3 个配置

在 `index.html` 顶部可以直接改：

```html
<meta name="coze-bot-id" content="7630382821936988186">
<meta name="coze-assistant-name" content="陪伴助手">
<meta name="coze-assistant-subtitle" content="点一下就能开始问。看字不方便，也可以听语音。">
```

如果要备用入口，再加上：

```html
<meta name="coze-store-url" content="你的 Coze 商店链接">
```

这是一个可直接部署到 Netlify 的 Coze Chat SDK H5 项目，前端使用原生 HTML/CSS/JS，后端使用 Netlify Functions 为前端换取 Coze OAuth JWT access token。

本项目的目标是：

- 页面打开后自动加载 Coze Chat SDK
- 前端不暴露 PAT 或私钥
- 每个访客拥有独立的 `site_user_id`
- 同一个 `site_user_id` 同时作为前端 `session_name`
- 使用 Netlify Functions 作为轻量后端

已内置的机器人信息：

- `bot_id`: `7630382821936988186`
- Chat SDK CDN：`https://lf-cdn.coze.cn/obj/unpkg/flow-platform/chat-app-sdk/1.2.0-beta.19/libs/cn/index.js`
- Coze token endpoint：`https://api.coze.cn/api/permission/oauth2/token`

## 项目结构

```text
.
├─ index.html
├─ netlify.toml
├─ package.json
├─ README.md
├─ .gitignore
└─ netlify/
   └─ functions/
      └─ coze-token.mjs
```

文件说明：

- `index.html`：移动端单页 H5，页面打开后自动加载聊天能力
- `netlify/functions/coze-token.mjs`：后端函数，用私钥签发 JWT assertion 并向 Coze 换取 access token
- `netlify.toml`：Netlify 构建与函数目录配置
- `package.json`：最小依赖与本地调试脚本
- `.gitignore`：忽略本地依赖、环境变量与 Netlify 临时目录

## 本地运行方法

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
```

### 2. 配置本地环境变量

你可以使用 Netlify CLI 的环境变量配置方式，或者在本地创建 `.env` 文件用于开发。

至少需要配置以下环境变量：

- `COZE_CLIENT_ID`
- `COZE_PRIVATE_KEY`

如果你的 Coze JWT 应用要求 `public key id / key id`，再额外配置：

- `COZE_PUBLIC_KEY_ID`

示例：

```env
COZE_CLIENT_ID=你的 Coze OAuth JWT 应用 Client ID
COZE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
COZE_PUBLIC_KEY_ID=可选，你的 Public Key ID
```

注意：

- 如果你把私钥写成单行字符串，需要保留 `\n`
- 函数代码会自动把 `\n` 还原成真实换行
- 不要把私钥写进前端文件

### 3. 启动本地调试

```bash
npm run dev
```

默认情况下，Netlify CLI 常见会启动在：

- 本地站点：`http://localhost:8888`

打开首页后，页面会自动：

1. 从 `localStorage` 读取 `site_user_id`
2. 没有则自动生成 `u_xxx`
3. 请求 `/.netlify/functions/coze-token?uid=<site_user_id>`
4. 成功后初始化 Coze Chat SDK

## Netlify 部署方法

### 方法一：GitHub 导入部署

1. 把当前项目推到 GitHub
2. 登录 Netlify
3. 选择“Add new project”或“Import from Git”
4. 选择你的 GitHub 仓库
5. 构建设置保持默认即可，本项目不需要额外前端构建步骤
6. 在 Netlify 项目后台配置环境变量
7. 点击部署

本项目已经包含：

- `publish = "."`
- `functions directory = netlify/functions`

因此通常不需要再手动填写构建目录和函数目录。

### 方法二：Netlify CLI 部署

如果你已经完成 `netlify login`，也可以在本地通过 CLI 进行部署。实际命令可按你的团队流程选择，这里不强制要求。

## 需要在 Netlify 配置的环境变量

在 Netlify 项目后台进入：

- `Site configuration`
- `Environment variables`

至少配置以下变量：

### 必填

- `COZE_CLIENT_ID`
- `COZE_PRIVATE_KEY`

### 可选

- `COZE_PUBLIC_KEY_ID`

说明：

- `COZE_CLIENT_ID`：Coze OAuth JWT 应用的客户端 ID
- `COZE_PRIVATE_KEY`：Coze OAuth JWT 应用对应私钥
- `COZE_PUBLIC_KEY_ID`：部分 Coze JWT 应用会要求在 JWT header 中带 `kid`，此时填写该值

## 如何在 Coze 后台创建 OAuth JWT 应用并填写信息

### 1. 进入 Coze OAuth 应用后台

前往 Coze 控制台的 OAuth 应用页面，创建一个 JWT / Service 类型的 OAuth 应用。

你需要记录下：

- Client ID
- Private Key
- 如果控制台提供了 Public Key ID / Key ID，也一并记录

### 2. 把信息填到 Netlify 环境变量中

对应关系如下：

- Coze 控制台中的 Client ID → `COZE_CLIENT_ID`
- Coze 控制台中的 Private Key → `COZE_PRIVATE_KEY`
- Coze 控制台中的 Public Key ID / Key ID → `COZE_PUBLIC_KEY_ID`

### 3. 注意字段命名可能存在差异

如你的 Coze 控制台字段命名不同，请按控制台实际字段替换。

本项目当前采用的是最常见、最保守的实现：

- JWT payload 中带 `iss`
- `sub`
- `aud`
- `iat`
- `exp`
- `jti`
- `session_name`

如果你的 Coze 控制台文档要求的字段名、传参位置或换 token 方式不同，请以控制台实际文档为准调整。

## 如何验证 `/.netlify/functions/coze-token` 是否工作正常

### 本地验证

本地运行 `npm run dev` 后，直接访问：

```text
http://localhost:8888/.netlify/functions/coze-token?uid=test123
```

如果环境变量配置正确，预期会返回类似：

```json
{
  "token": "xxxxx",
  "uid": "test123"
}
```

### 线上验证

部署到 Netlify 后，访问：

```text
https://你的站点域名/.netlify/functions/coze-token?uid=test123
```

如果配置正确，也应返回同样结构的 JSON。

### 错误时的返回格式

本项目会返回结构化错误，例如：

```json
{
  "error": {
    "code": "INVALID_UID",
    "message": "uid 仅支持字母、数字、下划线和中划线，长度不超过 64。"
  }
}
```

或：

```json
{
  "error": {
    "code": "MISSING_ENV",
    "message": "服务端缺少必要环境变量，请检查 COZE_CLIENT_ID 和 COZE_PRIVATE_KEY。"
  }
}
```

## 会话隔离说明

本项目通过以下方式做多人访问隔离：

1. 前端首次访问时生成 `site_user_id`
2. 将该值保存到 `localStorage["site_user_id"]`
3. 前端请求函数时把这个值作为 `uid`
4. 后端把 `uid` 写入 JWT payload 的 `session_name`
5. 前端初始化 Chat SDK 时，再把同一个值写到 `config.session_name`

这样每个访客会拥有自己的独立会话标识。

注意：

- 同一浏览器同一存储环境下，刷新页面后 `site_user_id` 会保持不变
- 无痕窗口、不同浏览器、不同设备通常会生成不同 `site_user_id`

## 常见报错排查

### 1. 页面提示“Coze Chat SDK CDN 加载失败”

排查方向：

- 检查当前网络是否可以访问 Coze CDN
- 检查微信内、企业网络或内网代理是否屏蔽该域名
- 检查 `index.html` 中的 SDK CDN 地址是否被误改

### 2. 页面提示“token 获取失败”

排查方向：

- `COZE_CLIENT_ID` 是否正确
- `COZE_PRIVATE_KEY` 是否完整
- 私钥中的换行是否正确
- Coze OAuth JWT 应用是否具备对应权限
- 若你的应用要求 `kid`，是否已配置 `COZE_PUBLIC_KEY_ID`

### 3. 返回 `MISSING_ENV`

说明服务端环境变量没有配全。

需要检查 Netlify 后台是否已设置：

- `COZE_CLIENT_ID`
- `COZE_PRIVATE_KEY`

### 4. 返回 `INVALID_UID`

说明请求中的 `uid` 不符合规则。

本项目当前只允许：

- 字母
- 数字
- 下划线 `_`
- 中划线 `-`

长度限制为 64 以内。

### 5. Coze 上游接口返回 502 类错误

说明 Netlify Function 自己运行了，但向 Coze 换 token 时失败。

排查方向：

- Coze OAuth JWT 应用是否配置正确
- JWT payload 是否符合你的 Coze 控制台要求
- `aud` 是否仍为 `https://api.coze.cn/api/permission/oauth2/token`
- 是否需要 `COZE_PUBLIC_KEY_ID`

### 6. 前端页面打开了，但聊天没有显示

排查方向：

- 函数接口是否已经成功返回 token
- 浏览器控制台是否有 SDK 初始化异常
- 当前 bot 是否已正确发布到 Chat SDK 渠道
- `bot_id` 是否正确

## 安全说明

本项目遵循以下原则：

- 前端不暴露 `PAT`
- 前端不暴露私钥
- 私钥只存在于 Netlify 环境变量
- 前端只请求你自己的 Netlify Function

请不要把以下信息提交到前端代码仓库：

- `pat_` 开头的个人访问令牌
- 实际私钥内容
- 带敏感信息的 `.env` 文件

## 额外兼容说明

本项目默认将 `session_name` 写入 JWT claim。

如果你的 Coze 控制台文档要求：

- `session_name` 放在其他字段
- token 接口需要额外字段
- JWT header 必须带 `kid`
- 或者响应字段命名不同

请按 Coze 控制台实际要求调整 `netlify/functions/coze-token.mjs`。
