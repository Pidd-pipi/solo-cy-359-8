# 城市定向越野活动平台

面向户外运动爱好者，提供定向越野线路设计、团队报名和积分排名的活动平台。

## Docker Compose 快速启动

首次启动前复制环境变量文件：

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:28519
- 后端健康检查：http://localhost:29519/health
- API 示例：http://localhost:28519/api/overview

## 项目主要功能

- 活动线路设计与发布：管理员在地图上标记起点、终点和打卡点（CP点），设置各点线索和任务，发布活动时注明难度（亲子/成人/专业）、时长和装备要求。
- 线索打卡点（GPS/二维码）：参与者到达打卡点附近（GPS定位）或扫描二维码完成打卡，系统记录到达时间，打卡点可设置答题或拍照任务增加趣味性。
- 团队报名与排名：用户以个人或团队形式报名，活动开始后系统记录各团队完成所有打卡点的总用时，按用时排名生成实时 leaderboard。
- 积分兑换商城：参与活动获得积分，积分可在商城兑换户外装备、活动优惠券或虚拟勋章，激励用户持续参与。
- 历史线路收藏：用户可收藏感兴趣的已结束活动线路，查看其他参与者的成绩和路线轨迹，为下次报名提供参考。

## 线路编排与发布（本次实现）

支持管理员从零编排线路并发布，主要流程均可在界面操作：

- **草稿新建 / 编辑**：录入起点、终点；按顺序添加打卡点（CP 点），每个点填写线索与任务；设置难度（亲子 / 成人 / 专业）、预计时长（分钟）和装备要求。草稿可反复保存，不做完整性校验。
- **发布校验**：发布时统一校验，未填写起点、终点、线索、难度或预计时长，或打卡点顺序重复时禁止发布，并以错误清单逐条提示缺失项；校验失败时线路仍保持草稿状态，且始终复用同一条草稿记录（不会因反复点击发布而生成同名重复草稿）。
- **已发布线路编辑**：编辑已发布线路时若把内容改到不再满足发布要求（如清空起点、移除全部打卡点、顺序重复），保存后会自动撤回为草稿并列出缺失项，系统中不会保留无效的已发布记录；补全后需再次点击发布。
- **活动列表**：发布后线路进入活动列表，展示状态（草稿 / 已发布）与基本信息（起止点、难度、时长、打卡点数量），支持按状态筛选与删除。
- **线路详情**：用时间线严格按 `order` 顺序展示每个打卡点的线索与任务。
- **数据持久化**：线路与打卡点保存在 PostgreSQL（容器启动时自动执行迁移），浏览器刷新或服务重启后仍保留；首次启动会附带一条已发布的示例线路。

页面：顶部导航「运营总览 / 活动线路」，活动线路下支持新建、编辑、详情。后端 REST 接口（前端经 Nginx `/api/` 反代访问）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/routes/` | 活动列表，可用 `?status=draft|published` 过滤 |
| POST | `/api/routes/` | 新建草稿 |
| GET | `/api/routes/{id}/` | 线路详情（含按顺序的打卡点） |
| PATCH | `/api/routes/{id}/` | 更新草稿 / 已发布线路内容 |
| DELETE | `/api/routes/{id}/` | 删除线路 |
| POST | `/api/routes/{id}/publish/` | 发布；校验失败返回 `400` 及 `errors` 缺失项清单 |

## 本地开发方式

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
pip install -r requirements.txt
python manage.py runserver 0.0.0.0:29519
```

## 自动化测试

线路编排与发布模块配有可重复运行的测试，支持干净环境连续执行；任一条失败都会以非零码退出并打印具体断言原因（用例名、实际值与期望值）。

一键运行前后端全部测试：

```bash
./run-tests.sh
```

后端（Django，独立测试数据库、用例间自动回滚，不依赖前端，也不影响运营总览与健康检查）：

```bash
cd backend
python manage.py test domain -v 2
```

覆盖：健康检查 `/health` 与运营总览 `/api/overview` 内容保持不变；草稿新建；缺少起点、终点、难度、时长、线索或任务时发布被拒；打卡点顺序重复被拒；发布后列表基本信息与详情严格按 `order` 排序；重新读取（模拟刷新）数据仍在；删除后读取/发布返回 404；**首次发布失败后连续重试只保留一条草稿**；**已发布线路被保存成不完整内容后自动回到草稿**；各类 4xx 失败请求不落库、不留下错误状态。

前端（Vitest + Testing Library，jsdom 内存环境与等价于后端的内存 API mock，无需后端在线）：

```bash
cd frontend
npm install
npm run test          # 单次运行
npm run test:watch    # 监听模式
npm run test:typecheck
```

覆盖：新建线路首次发布被校验拦下后连续重试，只 `create` 一次、后续复用同一 id 走 `update`，列表只有一条草稿；补全后在同一记录上发布成功；已发布线路被清空起点并移除全部打卡点后保存，状态自动撤回草稿、提示缺失项且不新建记录；失败请求后线路仍为草稿。

## 技术栈

| 分层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript、Ant Design、Vite |
| 后端 | Django + Python |
| 数据库 | PostgreSQL |
| 认证 | JWT |
| 依赖 | Django ORM、djangorestframework-simplejwt |

## 项目目录结构

```text
.
├── backend/              # 后端服务
├── database/             # 数据库脚本
├── frontend/             # 前端应用
├── docker-compose.yml    # 一键部署编排
├── .env.example          # 环境变量示例
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，避免中文目录名导致项目名为空 | lporienteering |
| DB_NAME | 数据库名称 | app |
| DB_USER | 数据库用户 | app |
| DB_PASSWORD | 数据库密码 | app_pwd |
| DB_ROOT_PASSWORD | 数据库 root 密码 | root_pwd |
| JWT_SECRET | JWT 签名密钥 | change_me_to_a_long_random_string |
| FRONTEND_PORT | 前端宿主机端口 | 28519 |
| BACKEND_PORT | 后端宿主机端口 | 29519 |
| DB_PORT | 数据库宿主机端口 | 5432 |

## Docker 部署说明

- 使用 `docker compose up -d` 启动，不需要额外传入 `-p`。
- `docker-compose.yml` 顶层已声明 `name: lporienteering`，并且 `.env` 包含 `COMPOSE_PROJECT_NAME=lporienteering`，可在中文目录名下启动。
- 数据库数据保存在命名卷 `db_data` 中，不依赖当前目录名。
- 前端容器由 Nginx 托管静态资源，并把 `/api/` 反向代理到 `backend:29519`。
- 若本地端口冲突，可修改 `.env` 中的 `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT`。

常用命令：

```bash
docker compose config --quiet
docker compose ps
docker compose down
```

## License

MIT
