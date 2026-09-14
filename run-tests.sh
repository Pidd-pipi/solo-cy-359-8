#!/usr/bin/env bash
# 一键运行线路编排与发布模块的全部自动化测试。
#
# - 后端：Django 测试运行器，使用独立的测试数据库（本地默认内存 SQLite；
#   容器/配置了 DB_HOST 时使用 <DB_NAME> 的 test_ 库），用例间自动回滚，可重复执行。
# - 前端：Vitest + Testing Library，jsdom 内存环境 + 内存 API mock，无需后端在线。
#
# 任一套件失败都会以非零码退出，便于 CI 判断。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"

echo "================================================"
echo " 后端测试：Django（线路 API / 校验 / 状态流转）"
echo "================================================"
(
  cd "$ROOT/backend"
  "$PYTHON_BIN" manage.py test domain -v 2
)

echo ""
echo "================================================"
echo " 前端测试：Vitest（编辑器草稿复用 / 撤回草稿）"
echo "================================================"
(
  cd "$ROOT/frontend"
  npm run test
)

echo ""
echo "全部测试通过。"
