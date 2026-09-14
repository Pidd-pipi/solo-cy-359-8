APP_NAME = "城市定向越野活动平台"
APP_CODE = "lporienteering"

# 线路难度等级（与发布表单中的选项保持一致）
DIFFICULTY_FAMILY = "亲子"
DIFFICULTY_ADULT = "成人"
DIFFICULTY_PRO = "专业"
DIFFICULTY_CHOICES = (
    (DIFFICULTY_FAMILY, "亲子（轻松休闲）"),
    (DIFFICULTY_ADULT, "成人（标准挑战）"),
    (DIFFICULTY_PRO, "专业（高强度越野）"),
)
DIFFICULTY_VALUES = [value for value, _label in DIFFICULTY_CHOICES]

# 线路生命周期状态
STATUS_DRAFT = "draft"
STATUS_PUBLISHED = "published"
STATUS_CHOICES = (
    (STATUS_DRAFT, "草稿"),
    (STATUS_PUBLISHED, "已发布"),
)

# 装备要求快捷选项，前端也可自由填写
EQUIPMENT_SUGGESTIONS = [
    "运动服",
    "徒步鞋",
    "手机充电宝",
    "饮用水",
    "雨衣",
    "指北针",
]
