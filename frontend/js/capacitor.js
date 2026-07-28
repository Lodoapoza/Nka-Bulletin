;(function () {
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
  const fs = isNative && Capacitor.Plugins.Filesystem

  const Native = {
    get share () { return Capacitor.Plugins.Share },
    get filesystem () { return fs },
    get network () { return Capacitor.Plugins.Network },
    get preferences () { return Capacitor.Plugins.Preferences },
    get push () { return Capacitor.Plugins.PushNotifications }
  }

  window.NativeBridge = {
    isNative,

    async share (options) {
      if (isNative) return Native.share.share(options)
      if (navigator.canShare && navigator.canShare(options)) {
        return navigator.share(options)
      }
      throw new Error('Share not supported')
    },

    async download (blob, filename) {
      if (isNative && fs) {
        const base64 = await new Promise((resolve) => {
          const r = new FileReader()
          r.onload = () => resolve(r.result.split(',')[1])
          r.readAsDataURL(blob)
        })
        await fs.writeFile({ path: filename, data: base64, directory: 'CACHE' })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    },

    async getNetworkStatus () {
      if (isNative) {
        const s = await Native.network.getStatus()
        return s.connected
      }
      return navigator.onLine
    },

    onNetworkChange (callback) {
      if (isNative) {
        return Native.network.addListener('networkStatusChange', (s) => callback(s.connected))
      }
      const f = () => callback(navigator.onLine)
      window.addEventListener('online', f)
      window.addEventListener('offline', f)
      return { remove: () => { window.removeEventListener('online', f); window.removeEventListener('offline', f) } }
    },

    async get (key) {
      if (isNative) {
        const r = await Native.preferences.get({ key })
        return r.value
      }
      return localStorage.getItem(key)
    },

    async set (key, value) {
      if (isNative) return Native.preferences.set({ key, value })
      localStorage.setItem(key, value)
    },

    async remove (key) {
      if (isNative) return Native.preferences.remove({ key })
      localStorage.removeItem(key)
    },

    async registerPush () {
      if (!isNative) throw new Error('Push only available in native app')
      const perm = await Native.push.requestPermission()
      if (!perm.granted) throw new Error('Push permission denied')
      const reg = await Native.push.register()
      return reg
    }
  }
})()
