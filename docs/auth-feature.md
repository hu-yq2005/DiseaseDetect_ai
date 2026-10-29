# 用户注册 / 登录功能：技术说明

> 本文档记录为 DiseaseDetect 新增的用户注册、登录和数据库持久化功能。

## 1. 概述

改动前，DiseaseDetect 是一个无状态的症状分诊应用：前端表单把数据提交到 `/api/diagnose`，后端用规则打分并调用 Gemini 生成结果，不涉及任何用户数据或数据库。

本次改动新增：

- 用户注册（邮箱 + 密码 + 可选的名字），账号保存在数据库中
- 用户登录 / 退出，登录状态保存在 cookie 中，有效期 7 天
- 访问控制：未登录用户不能使用症状检查（页面和 API 都受保护）
- 首页显示当前登录用户，并提供退出按钮

症状数据本身仍然**不会**保存，数据库只保存账号信息。

## 2. 技术选型

| 用途 | 技术 | 版本 | 选择原因 |
| --- | --- | --- | --- |
| ORM / 数据库访问 | Prisma (`prisma`, `@prisma/client`) | 6.x | 类型安全、迁移工具完善，切换数据库只需改配置 |
| 数据库 | SQLite | — | 本地开发零配置，数据存在一个文件里；可无缝切换到 PostgreSQL |
| 密码哈希 | bcryptjs | 2.x | 纯 JS 实现，无需编译原生模块；cost factor = 12 |
| 会话令牌 | jose (JWT, HS256) | 5.x | 支持 Edge Runtime，可以在 Next.js middleware 中验证 |
| 输入校验 | zod | 3.x（项目已有） | 与现有 `/api/diagnose` 的校验方式保持一致 |
| 框架 | Next.js App Router | 14.2.3（项目已有） | Route Handlers 实现 API，middleware 实现路由保护 |

### 为什么不用 NextAuth / Auth.js？

项目只需要“邮箱 + 密码”这一种登录方式，自己实现的代码量很小（约 150 行），逻辑完全透明，也不用额外学习 NextAuth 的配置。以后如果需要 Google / GitHub 等第三方登录，再迁移到 Auth.js 也比较容易。

## 3. 工作原理

### 3.1 注册流程

1. 用户在 `/register` 填写表单，前端 `POST /api/auth/register`
2. 后端用 zod 校验：邮箱格式合法、密码 8–128 位；邮箱会去掉首尾空格并转为小写
3. 用 bcrypt 对密码做哈希（数据库里只存哈希值，不存明文）
4. 写入 `User` 表；如果邮箱已存在（Prisma 错误码 `P2002`），返回 `409`
5. 注册成功后直接签发会话 cookie，用户自动处于登录状态，前端跳转到首页

### 3.2 登录流程

1. 用户在 `/login` 填写表单，前端 `POST /api/auth/login`
2. 按邮箱查找用户，用 `bcrypt.compare` 验证密码
3. 邮箱不存在和密码错误都返回同一条信息 “Invalid email or password.”，防止别人借此探测哪些邮箱已注册
4. 验证通过后签发会话 cookie

### 3.3 会话（Session）

- 登录后服务器签发一个 **JWT**，内容为 `sub`（用户 ID）、`email`、`name`，用 `AUTH_SECRET` 以 HS256 签名，有效期 7 天
- JWT 存在名为 `dd_session` 的 cookie 中，属性：
  - `httpOnly`：前端 JavaScript 读不到，可以防止 XSS 窃取令牌
  - `sameSite=lax`：降低 CSRF 风险
  - `secure`：仅在生产环境开启（本地开发用 http）
  - `path=/`，`maxAge=7 天`
- 会话是**无状态**的：服务器不保存 session 表，每次请求只验证签名和过期时间
- 退出登录 = 把 cookie 清空（`maxAge=0`）

### 3.4 访问控制（middleware）

`src/middleware.ts` 会拦截除下列路径之外的所有请求：

- `/api/auth/*`（注册、登录等接口本身）
- `/_next/static`、`/_next/image`、`favicon.ico`（静态资源）

处理规则：

| 请求 | 已登录 | 未登录 |
| --- | --- | --- |
| `/login`、`/register` | 重定向到 `/` | 正常显示 |
| 其他页面（如 `/`） | 正常显示 | 重定向到 `/login` |
| 其他 API（如 `/api/diagnose`） | 正常处理 | 返回 `401 {"error":"Authentication required."}` |

> middleware 运行在 Edge Runtime 中，不能使用 Prisma 和 bcrypt，所以 JWT 验证逻辑单独放在 `src/lib/session.ts`，这个文件只依赖 `jose`。

## 4. 数据库模型

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

- `email` 有唯一索引，保存前统一转为小写
- `passwordHash` 是 bcrypt 哈希，格式类似 `$2a$12$...`
- 初始迁移：`prisma/migrations/<时间戳>_init_users/`

## 5. API 接口

| 方法 | 路径 | 请求体 | 成功响应 | 失败响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ email, password, name? }` | `201 { user }` + 设置 cookie | `400` 校验失败；`409` 邮箱已存在 |
| POST | `/api/auth/login` | `{ email, password }` | `200 { user }` + 设置 cookie | `400` 校验失败；`401` 邮箱或密码错误 |
| POST | `/api/auth/logout` | 无 | `200 { ok: true }` + 清除 cookie | — |
| GET | `/api/auth/me` | 无 | `200 { user }` | `401 { user: null }` |

`user` 对象格式：`{ id, email, name }`，**不会**返回密码哈希。

## 6. 文件清单

### 新增文件

| 文件 | 作用 |
| --- | --- |
| `prisma/schema.prisma` | Prisma 配置：数据源（SQLite）和 `User` 模型 |
| `prisma/migrations/` | 数据库迁移 SQL，由 `prisma migrate dev` 生成，**需要提交到 git** |
| `prisma/dev.db` | 本地 SQLite 数据库文件（已加入 `.gitignore`） |
| `src/lib/db.ts` | 创建 PrismaClient 单例；开发环境挂在 `globalThis` 上，避免热重载时重复创建连接 |
| `src/lib/session.ts` | JWT 的签发（`signSession`）和验证（`verifySession`），以及 cookie 名和有效期常量。只依赖 `jose`，可在 Edge Runtime 中运行 |
| `src/lib/auth.ts` | 服务端认证工具：注册/登录的 zod 校验 schema，密码哈希与校验，设置/清除会话 cookie，`getCurrentSession()` 读取当前用户 |
| `src/app/api/auth/register/route.ts` | 注册接口 |
| `src/app/api/auth/login/route.ts` | 登录接口 |
| `src/app/api/auth/logout/route.ts` | 退出接口 |
| `src/app/api/auth/me/route.ts` | 返回当前登录用户 |
| `src/middleware.ts` | 路由保护：未登录用户重定向或返回 401，已登录用户访问登录页时重定向到首页 |
| `src/components/AuthForm.tsx` | 登录/注册共用的表单组件（`mode="login" \| "register"`），负责提交、显示错误、成功后跳转 |
| `src/components/UserMenu.tsx` | 首页右上角的用户信息和 “Sign out” 按钮 |
| `src/app/login/page.tsx` | 登录页面，渲染 `<AuthForm mode="login" />` |
| `src/app/register/page.tsx` | 注册页面，渲染 `<AuthForm mode="register" />` |
| `.env` | 本地环境变量（`DATABASE_URL`、`AUTH_SECRET`），已加入 `.gitignore` |
| `.env.example` | 环境变量模板，可提交到 git |
| `docs/auth-feature.md` | 本文档 |

### 修改的文件

| 文件 | 改动 |
| --- | --- |
| `src/app/page.tsx` | 引入并在页面顶部渲染 `<UserMenu />` |
| `package.json` / `package-lock.json` | 新增依赖：`@prisma/client`、`bcryptjs`、`jose`；开发依赖：`prisma`、`@types/bcryptjs` |
| `.gitignore` | 新增 `.env`、`.env.local`、`prisma/*.db`、`prisma/*.db-journal` |
| `README.md` | 新增 “User accounts” 一节，说明如何配置和初始化 |

`src/app/api/diagnose/route.ts` **没有改动**，它的访问控制完全由 middleware 负责。

## 7. 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | 数据库连接串。SQLite 默认是 `file:./dev.db`（路径相对于 `prisma/` 目录） |
| `AUTH_SECRET` | 是 | JWT 签名密钥，用 `openssl rand -base64 32` 生成。**更换后所有已登录用户都会被登出** |
| `GOOGLE_GENAI_API_KEY` | 是（诊断功能） | 原有变量，与认证无关 |

## 8. 本地运行

```bash
npm install
cp .env.example .env          # 然后填写 AUTH_SECRET 和 GOOGLE_GENAI_API_KEY
npx prisma migrate dev        # 创建数据库和表
npm run dev                   # 打开 http://localhost:3000/register
```

常用 Prisma 命令：

- `npx prisma studio`：在浏览器里查看和编辑数据库
- `npx prisma migrate dev --name <名称>`：修改 `schema.prisma` 之后生成新的迁移
- `npx prisma generate`：重新生成 Prisma Client（迁移时会自动执行）

## 9. 测试记录

已在本地启动服务器并用 curl 验证以下场景，结果全部符合预期：

| # | 场景 | 结果 |
| --- | --- | --- |
| 1 | 未登录访问 `/` | 307 重定向到 `/login` |
| 2 | 未登录调用 `/api/diagnose` | 401 Authentication required |
| 3 | 注册新用户（邮箱含大写字母） | 201，邮箱存为小写，并设置 cookie |
| 4 | 用同一邮箱重复注册 | 409 邮箱已存在 |
| 5 | 密码少于 8 位 | 400 并提示原因 |
| 6 | 登录后调用 `/api/auth/me` | 返回用户信息 |
| 7 | 登录后访问 `/` | 200 |
| 8 | 登录后访问 `/login` | 307 重定向到 `/` |
| 9 | 密码错误 | 401 Invalid email or password |
| 10 | 正确登录 | 200 并设置 cookie |
| 11 | 登录后调用 `/api/diagnose` | 通过认证（因未配置 Gemini key 返回 500，属预期） |
| 12 | 退出后调用 `/api/auth/me` | 401，`user: null` |
| 13 | 检查数据库 | 密码以 bcrypt 哈希（`$2a$12$...`）存储 |

`npm run build` 和 `tsc --noEmit` 均通过。

## 10. 已知限制和后续可改进的地方

- **无法主动吊销会话**：JWT 是无状态的，退出只清除本地 cookie。如果令牌被盗，在 7 天内仍然有效。需要时可以加一张 `Session` 表，或在 `User` 上加 `tokenVersion` 字段。
- **没有登录频率限制**：可以被暴力尝试密码，上线前应加 rate limiting。
- **没有邮箱验证和找回密码功能**。
- **SQLite 只适合本地和单机部署**：部署到 Vercel 等 serverless 平台时应换成 PostgreSQL（修改 `schema.prisma` 中的 `provider` 和 `DATABASE_URL`，然后重新生成迁移）。
- **登录是强制的**：如果希望未登录用户也能使用症状检查，可以修改 `src/middleware.ts` 中的 `matcher` 或判断逻辑。
- **症状记录没有和用户关联**：如果以后想保存用户的历史诊断，可以新增一个 `Assessment` 模型，通过 `userId` 关联到 `User`。
