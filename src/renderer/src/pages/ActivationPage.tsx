import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useAppStore, useToastStore } from '@renderer/store/app-store'
import logo from '@renderer/assets/logo.png'

export const ActivationPage = () => {
  const [licenseKey, setLicenseKey] = useState('')
  const [busy, setBusy] = useState(false)
  const error = useAppStore((state) => state.licenseError)
  const setLicense = useAppStore((state) => state.setLicense)
  const pushToast = useToastStore((state) => state.push)

  const activate = async (force = false) => {
    if (!licenseKey.trim()) return
    setBusy(true)
    const result = await window.desktop.license.activate(licenseKey.trim().toUpperCase(), force)
    setBusy(false)
    if (result.ok) {
      setLicense(result.data)
      pushToast({ kind: 'success', title: '激活成功', message: '授权已绑定到当前设备' })
      return
    }
    if (result.error.message.includes('绑定') && !force) {
      const confirmed = window.confirm('该授权可能已绑定其他设备，是否强制换绑到当前设备？')
      if (confirmed) void activate(true)
      return
    }
    pushToast({ kind: 'error', title: '激活失败', message: result.error.message })
  }

  return (
    <main className="activation-page">
      <section className="activation-panel">
        <div className="activation-panel__brand">
          <div className="brand__mark brand__mark--large"><img src={logo} alt="" /></div>
          <div>
            <span>蒲公英数据快照系统</span>
            <small>服务商数据采集与快照管理</small>
          </div>
        </div>
        <div className="activation-panel__content">
          <span className="eyebrow">设备授权</span>
          <h1>激活后开始使用</h1>
          <p>软件会在线校验授权状态。采集数据、账号信息与导出文件均保存在本机。</p>
          <label className="field">
            <span>授权码</span>
            <div className="input-with-icon">
              <KeyRound size={17} />
              <input
                autoFocus
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void activate()}
                placeholder="XXXX-XXXX-XXXX-XXXX"
              />
            </div>
          </label>
          {error && <div className="inline-alert inline-alert--warning">{error}</div>}
          <Button variant="primary" disabled={busy || !licenseKey.trim()} onClick={() => void activate()}>
            {busy && <LoaderCircle className="spin" size={16} />}
            验证并激活
          </Button>
        </div>
        <footer>如需购买或更换授权，请联系软件服务方。</footer>
      </section>
    </main>
  )
}