OVERVIEW = {
  "appName": "城市定向越野活动平台",
  "appCode": "lporienteering",
  "description": "面向户外运动爱好者，提供定向越野线路设计、团队报名和积分排名的活动平台。",
  "features": [
    {
      "id": 1,
      "title": "活动线路设计与发布",
      "description": "管理员在地图上标记起点、终点和打卡点（CP点），设置各点线索和任务，发布活动时注明难度（亲子/成人/专业）、时长和装备要求。",
      "status": "已上线",
      "metric": "88%"
    },
    {
      "id": 2,
      "title": "线索打卡点（GPS/二维码）",
      "description": "参与者到达打卡点附近（GPS定位）或扫描二维码完成打卡，系统记录到达时间，打卡点可设置答题或拍照任务增加趣味性。",
      "status": "排期中",
      "metric": "31 单"
    },
    {
      "id": 3,
      "title": "团队报名与排名",
      "description": "用户以个人或团队形式报名，活动开始后系统记录各团队完成所有打卡点的总用时，按用时排名生成实时 leaderboard。",
      "status": "巡检中",
      "metric": "10 项"
    },
    {
      "id": 4,
      "title": "积分兑换商城",
      "description": "参与活动获得积分，积分可在商城兑换户外装备、活动优惠券或虚拟勋章，激励用户持续参与。",
      "status": "优化中",
      "metric": "4 级"
    },
    {
      "id": 5,
      "title": "历史线路收藏",
      "description": "用户可收藏感兴趣的已结束活动线路，查看其他参与者的成绩和路线轨迹，为下次报名提供参考。",
      "status": "可导出",
      "metric": "28 条"
    }
  ],
  "kpis": [
    {
      "label": "今日处理",
      "value": "132",
      "trend": "+12%",
      "tone": "primary"
    },
    {
      "label": "预约/订单",
      "value": "82",
      "trend": "+8%",
      "tone": "warm"
    },
    {
      "label": "履约率",
      "value": "90%",
      "trend": "+3%",
      "tone": "cool"
    },
    {
      "label": "待处理",
      "value": "5",
      "trend": "需跟进",
      "tone": "neutral"
    }
  ],
  "records": [
    {
      "key": "lporienteering-1",
      "name": "活动线路设计与发布",
      "owner": "运营组",
      "status": "已上线",
      "metric": "88%",
      "priority": "高"
    },
    {
      "key": "lporienteering-2",
      "name": "线索打卡点（GPS/二维码）",
      "owner": "管理员",
      "status": "排期中",
      "metric": "31 单",
      "priority": "中"
    },
    {
      "key": "lporienteering-3",
      "name": "团队报名与排名",
      "owner": "服务台",
      "status": "巡检中",
      "metric": "10 项",
      "priority": "低"
    },
    {
      "key": "lporienteering-4",
      "name": "积分兑换商城",
      "owner": "财务组",
      "status": "优化中",
      "metric": "4 级",
      "priority": "高"
    },
    {
      "key": "lporienteering-5",
      "name": "历史线路收藏",
      "owner": "审核组",
      "status": "可导出",
      "metric": "28 条",
      "priority": "中"
    }
  ]
}

def get_overview():
    return OVERVIEW


def _is_blank(value):
    return value is None or str(value).strip() == ""


def collect_publish_errors(route):
    """发布前校验线路，返回缺失项 / 错误提示列表；列表为空即表示可发布。

    校验规则（与需求一一对应）：
    - 必须填写起点、终点
    - 必须选择难度、填写有效的预计时长
    - 至少包含一个打卡点，且每个打卡点的线索、任务均不能为空
    - 打卡点顺序不能重复
    """
    errors = []

    if _is_blank(route.start_point):
        errors.append("未填写起点")
    if _is_blank(route.end_point):
        errors.append("未填写终点")
    if _is_blank(route.difficulty):
        errors.append("未选择难度")
    if route.estimated_duration is None:
        errors.append("未填写预计时长")
    elif route.estimated_duration <= 0:
        errors.append("预计时长必须大于 0 分钟")

    checkpoints = list(route.checkpoints.all())
    if not checkpoints:
        errors.append("至少需要添加 1 个打卡点")
    else:
        seen_orders = set()
        duplicate_orders = set()
        for cp in checkpoints:
            if cp.order in seen_orders:
                duplicate_orders.add(cp.order)
            seen_orders.add(cp.order)
            if _is_blank(cp.clue):
                label = cp.name.strip() or f"第 {cp.order} 个打卡点"
                errors.append(f"打卡点「{label}」未填写线索")
            if _is_blank(cp.task):
                label = cp.name.strip() or f"第 {cp.order} 个打卡点"
                errors.append(f"打卡点「{label}」未填写任务")
        if duplicate_orders:
            ordered = sorted(duplicate_orders)
            rendered = "、".join(str(n) for n in ordered)
            errors.append(f"打卡点顺序重复（第 {rendered} 位），请调整后再发布")

    return errors
