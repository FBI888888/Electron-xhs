import {
  BadgeCheck,
  Database,
  Gauge,
  Link2,
  ListFilter,
  Send,
  Settings,
  ScrollText,
  ShieldCheck,
  Users
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppStore } from '@renderer/store/app-store'
import logo from '@renderer/assets/logo.png'

const navigation = [
  { to: '/', label: '工作台', icon: Gauge, end: true },
  { to: '/accounts', label: '账号管理', icon: Users },
  { to: '/collection', label: '采集任务', icon: Database },
  { to: '/links', label: '链接转换', icon: Link2 },
  { to: '/bloggers', label: '达人列表', icon: ListFilter },
  { to: '/invites', label: '达人邀约', icon: Send },
  { to: '/settings', label: '采集设置', icon: Settings },
  { to: '/about', label: '关于', icon: ScrollText }
]

export const AppShell = () => {
  const license = useAppStore((state) => state.license)
  const appInfo = useAppStore((state) => state.appInfo)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark"><img src={logo} alt="" /></div>
          <div>
            <strong>蒲公英数据快照</strong>
            <span>数据快照工具</span>
          </div>
        </div>
        <nav className="sidebar__nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <NavLink to="/license" className={({ isActive }) => `license-chip ${isActive ? 'license-chip--active' : ''}`}>
            <ShieldCheck size={17} />
            <div>
              <span>{license?.memberLevel ?? '未授权'}</span>
              <small>{license ? `剩余 ${license.daysRemaining} 天` : '需要激活'}</small>
            </div>
            <BadgeCheck size={16} />
          </NavLink>
          <span className="version-label">v{appInfo?.version ?? '1.6.0'}</span>
        </div>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  )
}