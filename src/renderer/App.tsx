import {
  HashRouter,
  Routes,
  Route,
  NavLink,
  Outlet,
} from "react-router-dom";
import { Cloud, LayoutDashboard, Plug, Settings, Clock, Server, Circle } from "lucide-react";
import { ToastContainer } from "@/components/ui/toast";
import Dashboard from "@/pages/Dashboard";
import SettingsPage from "@/pages/Settings";
import History from "@/pages/History";
import SSHMachines from "@/pages/SSHMachines";
import Plugins from "@/pages/Plugins";
import OSSBrowser from "@/pages/OSSBrowser";
import OSSPreviewWindow from "@/pages/OSSPreviewWindow";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "任务面板", group: "运行" },
  { to: "/history", icon: Clock, label: "历史记录", group: "运行" },
  { to: "/oss-browser", icon: Cloud, label: "OSS 浏览", group: "工具" },
  { to: "/ssh", icon: Server, label: "远程机器", group: "工具" },
  { to: "/plugins", icon: Plug, label: "项目能力", group: "配置" },
  { to: "/settings", icon: Settings, label: "设置", group: "配置" },
];

const navGroups = ["运行", "工具", "配置"];

function MainLayout() {
  return (
    <div className="flex h-screen">
      <ToastContainer />
      {/* 侧边栏 */}
      <nav className="w-52 border-r bg-muted/30 flex flex-col py-4 flex-shrink-0">
        <div className="px-4 mb-6">
          <h1 className="text-sm font-bold text-foreground">
            云桥上传器
          </h1>
          <div className="mt-1 text-xs text-muted-foreground">
            多云归档工作台
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-2">
          {navGroups.map((group) => (
            <div key={group}>
              <div className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">
                {group}
              </div>
              <div className="flex flex-col gap-1">
                {navItems
                  .filter((item) => item.group === group)
                  .map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mx-3 mt-4 rounded-md border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground">
            <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
            本地运行中
          </div>
          <div className="mt-1">Electron 工作台</div>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/oss-browser" element={<OSSBrowser />} />
          <Route path="/history" element={<History />} />
          <Route path="/ssh" element={<SSHMachines />} />
        </Route>
        <Route path="/oss-preview" element={<OSSPreviewWindow />} />
      </Routes>
    </HashRouter>
  );
}
