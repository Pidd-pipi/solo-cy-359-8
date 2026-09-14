import { ConfigProvider, Layout, Typography, theme } from "antd";
import { ApiOutlined } from "@ant-design/icons";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { APP_CODE, APP_NAME, APP_THEME } from "./constants/app";
import { REQUEST_MESSAGES } from "./constants/messages";
import { navItems } from "./routes";
import { OverviewPage } from "./pages/OverviewPage";
import { RouteListPage } from "./pages/RouteListPage";
import { RouteEditorPage } from "./pages/RouteEditorPage";
import { RouteDetailPage } from "./pages/RouteDetailPage";

const { Header, Content } = Layout;

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: APP_THEME.accent,
          colorText: APP_THEME.ink,
          colorBgBase: APP_THEME.paper,
          borderRadius: 8,
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="topbar">
          <div className="brand-block">
            <span className="brand-code">{APP_CODE}</span>
            <h1 className="brand-title">
              <Link to="/">{APP_NAME}</Link>
            </h1>
          </div>
          <div className="topbar-right">
            <nav className="topnav">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `topnav-link${isActive ? " topnav-link-active" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <a className="health-link" href={REQUEST_MESSAGES.healthPath}>
              <ApiOutlined /> API Health
            </a>
          </div>
        </Header>
        <Content className="workspace">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/routes" element={<RouteListPage />} />
            <Route path="/routes/new" element={<RouteEditorPage />} />
            <Route path="/routes/:id/edit" element={<RouteEditorPage />} />
            <Route path="/routes/:id" element={<RouteDetailPage />} />
            <Route path="*" element={<OverviewPage />} />
          </Routes>
        </Content>
        <Typography.Paragraph className="app-footer">
          城市定向越野活动平台 · 线路编排与发布
        </Typography.Paragraph>
      </Layout>
    </ConfigProvider>
  );
}
