import { useEffect, useState } from "react";
import { Typography } from "antd";
import { fetchOverview } from "../api/client";
import { REQUEST_MESSAGES } from "../constants/messages";
import { createFallbackOverview } from "../state/dashboard";
import type { OverviewResponse } from "../types";
import { FeatureStrip } from "../components/FeatureStrip";
import { MetricGrid } from "../components/MetricGrid";
import { OperationsTable } from "../components/OperationsTable";

export function OverviewPage() {
  const [overview, setOverview] = useState<OverviewResponse>(createFallbackOverview());
  const [notice, setNotice] = useState(REQUEST_MESSAGES.overviewFallback);

  useEffect(() => {
    fetchOverview()
      .then((payload) => {
        setOverview(payload);
        setNotice("后端服务已联通，当前展示实时接口数据。");
      })
      .catch(() => setNotice(REQUEST_MESSAGES.overviewFallback));
  }, []);

  return (
    <>
      <section className="lead-grid">
        <article className="hero-panel">
          <span className="pill">{notice}</span>
          <Typography.Title level={2}>{overview.appName}</Typography.Title>
          <p>{overview.description}</p>
        </article>
        <MetricGrid items={overview.kpis} />
      </section>
      <FeatureStrip items={overview.features} />
      <section className="work-panel">
        <Typography.Title level={3}>运营任务流</Typography.Title>
        <OperationsTable records={overview.records} />
      </section>
    </>
  );
}
