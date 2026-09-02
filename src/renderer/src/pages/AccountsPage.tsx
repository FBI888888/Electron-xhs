import { useEffect, useMemo, useState } from 'react'
import { KeyRound, LogIn, Plus, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import type { AccountSessionEvent, AccountView, PasswordLoginInput } from '@shared/models'
import { Button } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { PageHeader } from '@renderer/components/PageHeader'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

interface AccountEditor {
  id?: string
  remark: string
  cookies: string
  email: string
  password: string
  clearCredentials: boolean
}

const emptyEditor = (): AccountEditor => ({
  remark: '',
  cookies: '',
  email: '',
  password: '',
  clearCredentials: false
})

const passwordLoginDraft = (): PasswordLoginInput => ({ remark: '', email: '', password: '' })

export const AccountsPage = () => {
  const accounts = useAppStore((state) => state.accounts)
  const setAccounts = useAppStore((state) => state.setAccounts)
  const pushToast = useToastStore((state) => state.push)
  const [editing, setEditing] = useState<AccountEditor | null>(null)
  const [loginDraft, setLoginDraft] = useState<PasswordLoginInput | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sessionEvent, setSessionEvent] = useState<AccountSessionEvent | null>(null)
  const activeCount = useMemo(
    () => accounts.filter((account) => account.status === 'active').length,
    [accounts]
  )

  useEffect(
    () =>
      window.desktop.accounts.onSessionEvent((event) => {
        setSessionEvent(event)
        if (event.accounts) setAccounts(event.accounts)
        if (event.account) {
          setAccounts([
            ...useAppStore.getState().accounts.filter((item) => item.id !== event.account?.id),
            event.account
          ])
        }
      }),
    [setAccounts]
  )

  const replaceAccount = (account: AccountView): void => {
    const current = useAppStore.getState().accounts
    setAccounts([...current.filter((item) => item.id !== account.id), account])
  }

  const openWebLogin = async (): Promise<void> => {
    setBusy('web-login')
    pushToast({ kind: 'info', title: '正在打开登录窗口', message: '正在验证授权并创建安全登录会话' })
    const result = await window.desktop.accounts.openLogin()
    setBusy(null)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '无法打开登录窗口', message: result.error.message })
      return
    }
    pushToast({ kind: 'info', title: '登录窗口已打开', message: '请在窗口中完成蒲公英登录' })
  }

  const saveEditor = async (): Promise<void> => {
    if (!editing) return
    if (!editing.remark.trim()) {
      pushToast({ kind: 'warning', title: '无法保存', message: '备注名称不能为空' })
      return
    }
    if (!editing.id && !editing.cookies.trim()) {
      pushToast({ kind: 'warning', title: '无法保存', message: 'Cookies 不能为空' })
      return
    }

    setBusy(editing.id ?? 'create')
    const result = editing.id
      ? await window.desktop.accounts.update(editing.id, {
          remark: editing.remark,
          cookies: editing.cookies || undefined,
          email: editing.email || undefined,
          password: editing.password || undefined,
          clearCredentials: editing.clearCredentials
        })
      : await window.desktop.accounts.create({
          remark: editing.remark,
          cookies: editing.cookies,
          email: editing.email || undefined,
          password: editing.password || undefined
        })
    setBusy(null)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '账号保存失败', message: result.error.message })
      return
    }
    replaceAccount(result.data)
    setEditing(null)
    pushToast({ kind: 'success', title: '账号已保存', message: result.data.remark })
  }

  const closePasswordLogin = async (): Promise<void> => {
    if (busy === 'password-login') await window.desktop.accounts.cancelLogin()
    setBusy(null)
    setLoginDraft(null)
  }

  const submitPasswordLogin = async (): Promise<void> => {
    if (!loginDraft) return
    if (!loginDraft.remark.trim() || !loginDraft.email.trim() || !loginDraft.password) {
      pushToast({ kind: 'warning', title: '信息不完整', message: '备注、邮箱和密码均不能为空' })
      return
    }
    setBusy('password-login')
    const result = await window.desktop.accounts.passwordLogin(loginDraft)
    setBusy(null)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '密码登录失败', message: result.error.message })
      return
    }
    replaceAccount(result.data)
    setLoginDraft(null)
    pushToast({ kind: 'success', title: '密码登录成功', message: result.data.remark })
  }

  const check = async (accountId: string): Promise<void> => {
    setBusy(`check:${accountId}`)
    const result = await window.desktop.accounts.check(accountId)
    setBusy(null)
    if (!result.ok) {
      const refreshed = await window.desktop.accounts.list()
      if (refreshed.ok) setAccounts(refreshed.data)
      pushToast({ kind: 'error', title: '账号检查失败', message: result.error.message })
      return
    }
    replaceAccount(result.data)
    pushToast({ kind: 'success', title: '账号正常', message: result.data.nickname || result.data.remark })
  }

  const checkAll = async (): Promise<void> => {
    if (accounts.length === 0) return
    setBusy('check-all')
    const result = await window.desktop.accounts.checkAll()
    setBusy(null)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '批量检查失败', message: result.error.message })
      return
    }
    setAccounts(result.data)
    const available = result.data.filter((account) => account.status === 'active').length
    pushToast({ kind: 'success', title: '检查完成', message: `${available}/${result.data.length} 个账号可用` })
  }

  const refresh = async (accountId: string): Promise<void> => {
    setBusy(`refresh:${accountId}`)
    const result = await window.desktop.accounts.refresh(accountId)
    setBusy(null)
    if (!result.ok) {
      pushToast({ kind: 'error', title: 'Cookies 更新失败', message: result.error.message })
      return
    }
    replaceAccount(result.data)
    pushToast({ kind: 'success', title: 'Cookies 已更新', message: result.data.remark })
  }

  const remove = async (accountId: string): Promise<void> => {
    if (!window.confirm('确定删除这个账号吗？')) return
    const result = await window.desktop.accounts.remove(accountId)
    if (!result.ok) {
      pushToast({ kind: 'error', title: '删除失败', message: result.error.message })
      return
    }
    setAccounts(accounts.filter((account) => account.id !== accountId))
  }

  return (
    <div className="page">
      <PageHeader
        title="账号管理"
        description={`共 ${accounts.length} 个账号，${activeCount} 个可用于采集。密码仅在主进程安全存储中使用。`}
        actions={
          <>
            <Button
              icon={<RefreshCw size={16} />}
              disabled={accounts.length === 0 || busy === 'check-all'}
              onClick={() => void checkAll()}
            >
              检查全部
            </Button>
            <Button
              icon={<LogIn size={16} />}
              disabled={busy === 'web-login'}
              onClick={() => void openWebLogin()}
            >
              网页登录
            </Button>
            <Button icon={<KeyRound size={16} />} onClick={() => setLoginDraft(passwordLoginDraft())}>
              密码登录
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing(emptyEditor())}>
              添加账号
            </Button>
          </>
        }
      />
      <div className="page-content">
        {sessionEvent && ['opening', 'waiting', 'submitting', 'verifying', 'refreshing'].includes(sessionEvent.stage) && (
          <div className="capture-hint">
            <span className="capture-dot capture-dot--ready" />
            {sessionEvent.message}
          </div>
        )}
        {accounts.length === 0 ? (
          <EmptyState
            title="还没有采集账号"
            description="可通过网页登录或密码登录自动获取 Cookies，也可以手动添加已有账号。"
            action={
              <Button variant="primary" onClick={() => void openWebLogin()}>
                登录蒲公英账号
              </Button>
            }
          />
        ) : (
          <div className="table-panel">
            <table className="data-table">
              <thead>
                <tr><th>备注</th><th>蒲公英昵称</th><th>状态</th><th>今日使用</th><th>登录凭据</th><th>Cookies</th><th className="align-right">操作</th></tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <button
                        className="cell-link"
                        onClick={() =>
                          setEditing({
                            id: account.id,
                            remark: account.remark,
                            cookies: '',
                            email: '',
                            password: '',
                            clearCredentials: false
                          })
                        }
                      >
                        {account.remark || '未命名账号'}
                      </button>
                    </td>
                    <td>{account.nickname || '—'}</td>
                    <td><StatusBadge status={account.status} /></td>
                    <td>{account.todayUseCount}</td>
                    <td>{account.hasCredentials ? account.emailMasked || '已保存' : '未保存'}</td>
                    <td><code>{account.cookiePreview || '—'}</code></td>
                    <td>
                      <div className="row-actions">
                        <button title="检查" disabled={Boolean(busy)} onClick={() => void check(account.id)}>
                          <RefreshCw size={16} />
                        </button>
                        <button
                          title={account.hasCredentials ? '更新 Cookies' : '未保存账号密码'}
                          disabled={Boolean(busy) || !account.hasCredentials}
                          onClick={() => void refresh(account.id)}
                        >
                          <RotateCw size={16} />
                        </button>
                        <button title="删除" disabled={Boolean(busy)} onClick={() => void remove(account.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editing)}
        title={editing?.id ? '编辑账号' : '添加账号'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>取消</Button>
            <Button variant="primary" disabled={Boolean(busy)} onClick={() => void saveEditor()}>
              保存账号
            </Button>
          </>
        }
      >
        {editing && (
          <div className="form-grid">
            <label className="field"><span>备注名称</span><input value={editing.remark} onChange={(event) => setEditing({ ...editing, remark: event.target.value })} /></label>
            <label className="field field--full"><span>{editing.id ? '替换 Cookies（留空表示不修改）' : 'Cookies'}</span><textarea rows={5} value={editing.cookies} onChange={(event) => setEditing({ ...editing, cookies: event.target.value })} /></label>
            <label className="field"><span>登录邮箱（可选）</span><input value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} placeholder={editing.id ? '留空表示不修改' : ''} /></label>
            <label className="field"><span>登录密码（可选）</span><input type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} placeholder={editing.id ? '留空表示不修改' : ''} /></label>
            {editing.id && <label className="toggle-row"><input type="checkbox" checked={editing.clearCredentials} onChange={(event) => setEditing({ ...editing, clearCredentials: event.target.checked })} /><span><strong>清除已保存的账号密码</strong><small>清除后将无法自动更新 Cookies</small></span></label>}
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(loginDraft)}
        title="账号密码自动登录"
        onClose={() => void closePasswordLogin()}
        footer={
          <>
            <Button onClick={() => void closePasswordLogin()}>取消</Button>
            <Button variant="primary" disabled={busy === 'password-login'} onClick={() => void submitPasswordLogin()}>
              开始登录
            </Button>
          </>
        }
      >
        {loginDraft && (
          <div className="form-grid">
            <label className="field"><span>备注名称</span><input value={loginDraft.remark} onChange={(event) => setLoginDraft({ ...loginDraft, remark: event.target.value })} /></label>
            <label className="field"><span>邮箱账号</span><input value={loginDraft.email} onChange={(event) => setLoginDraft({ ...loginDraft, email: event.target.value })} /></label>
            <label className="field field--full"><span>登录密码</span><input type="password" value={loginDraft.password} onChange={(event) => setLoginDraft({ ...loginDraft, password: event.target.value })} /></label>
            <p className="muted-copy">登录过程在独立隔离会话中执行；页面结构变化时会显示窗口，允许手动完成验证。</p>
          </div>
        )}
      </Dialog>
    </div>
  )
}