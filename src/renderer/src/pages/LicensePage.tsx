import { Copy, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { PageHeader } from '@renderer/components/PageHeader'
import { useAppStore, useToastStore } from '@renderer/store/app-store'

export const LicensePage = () => {
  const license = useAppStore((state) => state.license)
  const appInfo = useAppStore((state) => state.appInfo)
  const setLicense = useAppStore((state) => state.setLicense)
  const pushToast = useToastStore((state) => state.push)

  const verify = async () => {
    const result = await window.desktop.license.verify()
    if (result.ok) {
      setLicense(result.data)
      pushToast({ kind: 'success', title: '授权正常', message: '已完成在线校验' })
    } else pushToast({ kind: 'error', title: '校验失败', message: result.error.message })
  }

  const unbind = async () => {
    if (!window.confirm('确定解绑当前授权并退出软件吗？')) return
    const result = await window.desktop.license.unbind()
    if (result.ok) {
      setLicense(null, '软件未激活')
      await window.desktop.app.quit()
    } else pushToast({ kind: 'error', title: '解绑失败', message: result.error.message })
  }

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    pushToast({ kind: 'success', title: '已复制', message: '内容已写入剪贴板' })
  }

  return (
    <div className="page">
      <PageHeader title="授权信息" description="查看设备授权、存储安全与在线校验状态。" actions={<Button icon={<RefreshCw size={16} />} onClick={() => void verify()}>重新校验</Button>} />
      <div className="page-content page-content--scroll license-layout">
        <section className="license-hero">
          <div className="license-hero__icon"><ShieldCheck size={28} /></div>
          <div><span className="eyebrow">当前会员</span><h2>{license?.memberLevel}</h2><p>授权有效期至 {license?.expireAt ? new Date(license.expireAt).toLocaleString('zh-CN') : '—'}</p></div>
          <strong>{license?.daysRemaining ?? 0}<small>剩余天数</small></strong>
        </section>
        <section className="section-panel detail-list">
          <div><span>授权码</span><code>{license?.licenseKey ?? '—'}</code><button onClick={() => void copy(license?.licenseKey ?? '')}><Copy size={15} /></button></div>
          <div><span>机器码</span><code>{license?.machineCode ?? '—'}</code><button onClick={() => void copy(license?.machineCode ?? '')}><Copy size={15} /></button></div>
          <div><span>本地数据目录</span><code>{appInfo?.dataDirectory ?? '—'}</code></div>
          <div><span>敏感信息保护</span><strong>{appInfo?.security.secretsEncrypted ? '系统加密已启用' : '兼容存储模式'}</strong></div>
          {appInfo?.security.warning && <div className="inline-alert inline-alert--warning">{appInfo.security.warning}</div>}
        </section>
        <section className="danger-zone"><div><h3>解绑当前设备</h3><p>解绑后需要重新输入授权码才能进入软件。</p></div><Button variant="danger" icon={<LogOut size={16} />} onClick={() => void unbind()}>解绑并退出</Button></section>
      </div>
    </div>
  )
}