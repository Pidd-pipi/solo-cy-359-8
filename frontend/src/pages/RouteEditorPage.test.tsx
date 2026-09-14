import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouteEditorPage } from "./RouteEditorPage";
import { ApiError } from "../api/client";
import {
  getCallCounts,
  getMockRoute,
  resetMock,
  routeCount,
  seedValidPublished,
} from "../test/mockApi";

// 路由钩子用最小 mock，navigate 被 spy 捕获
const navigate = vi.fn();
let routeParams: Record<string, string | undefined> = { id: "new" };

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useParams: () => routeParams,
}));

// 用内存 mock 替换真实网络层，行为与后端保持一致
vi.mock("../api/client", async () => {
  const m = await import("../test/mockApi");
  return {
    ApiError: m.ApiError,
    createRoute: m.createRoute,
    fetchRoute: m.fetchRoute,
    publishRoute: m.publishRoute,
    updateRoute: m.updateRoute,
  };
});

const TITLE_INPUT = "例如：滨江公园亲子寻宝线";
const START_INPUT = "例如：公园南门牌楼";
const END_INPUT = "例如：北门广场";
const DURATION_INPUT = "例如：90";
const PUBLISH_BTN = "发布线路";
const SAVE_BTN = /保\s*存\s*草\s*稿/;

async function chooseDifficulty(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(document.querySelector(".ant-select-selector") as Element);
  const option = await screen.findByText(label);
  await user.click(option);
}

async function fillOneCheckpoint(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /添加打卡点/ }));
  const name = document.querySelector("input.cp-name-input") as HTMLInputElement;
  await user.type(name, "唯一打卡点");
  await user.type(screen.getByPlaceholderText(/沿主路/), "找到红色长椅");
  await user.type(screen.getByPlaceholderText(/扫描椅背/), "完成合影");
}

function renderEditor() {
  return render(<RouteEditorPage />);
}

beforeEach(() => {
  resetMock();
  navigate.mockClear();
  routeParams = { id: "new" };
  window.history.replaceState(null, "", "/routes/new");
});

describe("失败流程一：首次发布失败后连续重试只保留一条草稿", () => {
  it("两次发布被拒都复用同一条草稿，不会重复创建", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByPlaceholderText(TITLE_INPUT), "重试不重复草稿");

    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));
    expect(await screen.findByText("存在缺失项，暂不能发布")).toBeInTheDocument();

    let counts = getCallCounts();
    expect(counts.create).toBe(1);
    expect(counts.publish).toBe(1);
    expect(counts.update).toBe(0);
    expect(routeCount()).toBe(1);
    // 草稿落库后地址栏应固定到该草稿，便于重试/刷新复用
    expect(window.location.pathname).toBe("/routes/1/edit");
    expect(getMockRoute(1)?.status).toBe("draft");

    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));
    await waitFor(() => expect(getCallCounts().publish).toBe(2));

    counts = getCallCounts();
    expect(counts.create).toBe(1); // 关键：没有再次 POST 新建
    expect(counts.update).toBe(1); // 第二次复用同一 id 走更新
    expect(routeCount()).toBe(1); // 列表里只有一条同名草稿
    expect(getMockRoute(1)?.status).toBe("draft"); // 失败请求没有留下错误的已发布状态
    expect(window.location.pathname).toBe("/routes/1/edit");
  });

  it("补全内容后在同一条记录上发布成功", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByPlaceholderText(TITLE_INPUT), "补全后发布");
    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));
    await screen.findByText("存在缺失项，暂不能发布");
    expect(getCallCounts().create).toBe(1);

    await user.type(screen.getByPlaceholderText(START_INPUT), "南门");
    await user.type(screen.getByPlaceholderText(END_INPUT), "北门");
    await chooseDifficulty(user, "亲子（轻松休闲）");
    await user.type(screen.getByPlaceholderText(DURATION_INPUT), "60");
    await fillOneCheckpoint(user);

    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/routes/1"));

    expect(getCallCounts().create).toBe(1);
    expect(routeCount()).toBe(1);
    expect(getMockRoute(1)?.status).toBe("published");
  });
});

describe("失败流程二：已发布线路被保存为不完整内容后自动回到草稿", () => {
  it("清空起点并移除全部打卡点后保存，线路撤回草稿并提示缺失项", async () => {
    const user = userEvent.setup();
    const id = seedValidPublished();
    routeParams = { id: String(id) };
    renderEditor();

    // 等待已发布线路载入
    const start = await screen.findByPlaceholderText(START_INPUT);
    await waitFor(() =>
      expect(start).toHaveValue("南门牌楼")
    );
    expect(screen.getByRole("heading", { name: "编辑已发布线路" })).toBeInTheDocument();

    await user.clear(start);
    await waitFor(() => expect(start).toHaveValue(""));
    // 移除全部 2 个打卡点
    while (document.querySelectorAll(".cp-card").length > 0) {
      await user.click(document.querySelector(".cp-card .ant-btn-dangerous") as Element);
    }
    expect(document.querySelectorAll(".cp-card").length).toBe(0);

    await user.click(screen.getByRole("button", { name: SAVE_BTN }));

    // 持久层：状态被撤回、复用同一记录、未新建
    await waitFor(() => expect(getMockRoute(id)?.status).toBe("draft"));
    expect(getCallCounts().create).toBe(0);
    expect(getCallCounts().update).toBe(1);
    expect(routeCount()).toBe(1);

    // 界面：撤回提示 + 缺失项清单 + 标题切换为草稿
    expect(await screen.findByText(/撤回为草稿/)).toBeInTheDocument();
    const alert = document.querySelector(".publish-alert") as HTMLElement;
    expect(alert.textContent).toContain("未填写起点");
    expect(alert.textContent).toContain("打卡点");
    expect(screen.getByRole("heading", { name: "编辑线路草稿" })).toBeInTheDocument();
    // 保存草稿不跳详情
    expect(navigate).toHaveBeenCalledWith(`/routes/${id}/edit`, expect.anything());
    expect(navigate).not.toHaveBeenCalledWith(`/routes/${id}`);
  });

  it("已发布线路内容仍然合规时保存，保持已发布并进入详情", async () => {
    const user = userEvent.setup();
    const id = seedValidPublished();
    routeParams = { id: String(id) };
    renderEditor();
    await screen.findByPlaceholderText(START_INPUT);

    await user.clear(screen.getByPlaceholderText(/饮用水、雨衣、徒步鞋/));
    await user.type(screen.getByPlaceholderText(/饮用水、雨衣、徒步鞋/), "饮用水、口哨");
    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/routes/${id}`));
    expect(getMockRoute(id)?.status).toBe("published");
    expect(getCallCounts().create).toBe(0);
  });
});

describe("失败请求不留下错误状态", () => {
  it("发布接口报错时线路保持草稿且错误清单可见", async () => {
    const user = userEvent.setup();
    routeParams = { id: "new" };
    renderEditor();
    await user.type(screen.getByPlaceholderText(TITLE_INPUT), "报错不落库");
    await user.click(screen.getByRole("button", { name: PUBLISH_BTN }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/未填写起点/)).toBeInTheDocument();
    expect(getMockRoute(1)?.status).toBe("draft");
    // ApiError 来自真实客户端模块，保证前端判断类型一致
    expect(new ApiError(400, "x", ["y"])).toBeInstanceOf(Error);
  });
});
