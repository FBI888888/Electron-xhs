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
import { AboutPage } from '@renderer/pages/AboutPage'
import logo from '@renderer/assets/logo.png'

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
        <div className="boot-screen__mark"><img src={logo} alt="" /></div>
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
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Dialog
        open={disclaimerOpen}
        title="软件使用免责声明"
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
          <p>本软件仅提供公开信息采集工具功能，仅支持采集小红书蒲公英平台已公开的达人主页信息，不具备获取非公开数据的能力。</p>
          <p>您承诺使用本软件时严格遵守《中华人民共和国网络安全法》《数据安全法》《个人信息保护法》等相关法律法规，以及小红书蒲公英平台的用户协议、社区规范等规则，不得用于任何违法违规用途。</p>
          <p><strong>禁止利用本软件实施以下行为：</strong>采集非公开信息、过度爬取导致平台服务器负载异常、侵害他人隐私权/知识产权/商业秘密等合法权益、用于 spam 营销、诈骗等违法活动。</p>
          <p>本软件仅为工具提供者，不对您使用软件的行为及结果承担责任。如因您违规使用软件导致的任何法律纠纷、行政处罚、第三方索赔等，均由您自行承担全部责任，与软件开发者无关。</p>
          <p>如发现软件存在异常或有违规使用需求，开发者有权暂停或终止您的使用权限，且不承担任何赔偿责任。</p>
          <p><strong>您使用本软件即表示已充分阅读、理解并同意本声明全部条款，若不同意请立即停止使用。</strong></p>
        </div>
      </Dialog>
      <ToastViewport />
    </HashRouter>
  )
}