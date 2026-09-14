"""线路编排与发布的自动化测试包。

测试可在干净环境重复执行：
    cd backend
    python manage.py test domain -v 2

每个测试类基于 DRF 的 APITestCase，Django 会在独立的测试数据库中执行并在
用例结束后回滚，互不影响；迁移中的示例线路也会进入测试库，用例一律按
自定义标题/主键查询，避免与示例数据耦合。
"""
