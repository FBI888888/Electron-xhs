import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAppStore, useToastStore } from '@renderer/store/app-store'
import { AppShell } from './AppShell'
import { ToastViewport } from '@renderer/components/ToastViewport'
import { Dialog } from '@renderer/components/Dialog'
import { Button } from '@renderer/components/Button'
import { ActivationPage } from '@renderer/pages/ActivationPage'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { AccountsPage } from '@renderer/pages/AccountsPage'
import { CollectionPage } from '@renderer/pages/CollectionPage'
import { LinksPage } from '@renderer/pages/LinksPage'
import { BloggersPage } from '@renderer/pages/BloggersPage'
import { InvitesPage } from '@renderer/pages/InvitesPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { LicensePage } from '@renderer/pages/LicensePage'

export const App = () => {
  const initialize = useAppStore((state) => state.initialize)
  const loading = useAppStore((state) => state.loading)
  const license = useAppStore((state) => state.license)
  const setLicense = useAppStore((state) => state.setLicense)
  const setAccounts = useAppStore((state) => state.setAccounts)
  const setTask = useAppStore((state) => state.setTask)
  const pushToast = useToastStore((state) => state.push)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)

  useEffect(() => {
    void initialize()
    const unsubscribeTask = window.desktop.collection.onEvent((event) => {
      if (event.type === 'state') setTask(event.state)
      if (event.type === 'log' && event.level === 'error') {
        pushToast({ kind: 'error', title: '任务异常', message: event.message })
      }
    })
    const unsubscribeLicense = window.desktop.license.onExpired((message) => {
      setLicense(null, message)
      pushToast({ kind: 'error', title: '授权已失效', message })
    })
    const unsubscribeAccount = window.desktop.accounts.onSessionEvent((event) => {
      if (event.accounts) setAccounts(event.accounts)
      if (event.account) {
        const current = useAppStore.getState().accounts
        setAccounts([...current.filter((item) => item.id !== event.account?.id), event.account])
      }
      if (event.operation === 'web-login' && event.stage === 'completed') {
        pushToast({ kind: 'success', title: '网页登录成功', message: event.message })
      }
      if (event.operation === 'web-login' && event.stage === 'failed') {
        pushToast({ kind: 'error', title: '网页登录失败', message: event.message })
      }
    })
    return () => {
      unsubscribeTask()
      unsubscribeLicense()
      unsubscribeAccount()
    }
  }, [initialize, pushToast, setAccounts, setLicense, setTask])

  useEffect(() => {
    if (!loading && license && sessionStorage.getItem('disclaimer-accepted') !== 'yes') {
      const timer = window.setTimeout(() => setDisclaimerOpen(true), 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [license, loading])

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-screen__mark">P</div>
        <p>正在初始化本地数据与授权状态…</p>
      </div>
    )
  }

  if (!license) {
    return (
      <>
        <ActivationPage />
        <ToastViewport />
      </>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="bloggers" element={<BloggersPage />} />
          <Route path="invites" element={<InvitesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Dialog
        open={disclaimerOpen}
        title="软件使用声明"
        onClose={() => undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => void window.desktop.app.quit()}>拒绝并退出</Button>
            <Button
              variant="primary"
              onClick={() => {
                sessionStorage.setItem('disclaimer-accepted', 'yes')
                setDisclaimerOpen(false)
              }}
            >
              接受并继续
            </Button>
          </>
        }
      >
        <div className="legal-copy">
          <p>本软件用于采集用户已授权访问的小红书蒲公英达人数据并生成本地快照。</p>
          <p>使用者应遵守法律法规、平台规则及账号授权范围，不得用于绕过权限、骚扰用户或其他违规用途。</p>
          <p>继续使用表示您理解采集频率、账号状态和数据合规责任由实际使用者承担。</p>
        </div>
      </Dialog>
      <ToastViewport />
    </HashRouter>
  )
}