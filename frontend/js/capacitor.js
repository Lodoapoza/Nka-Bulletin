;(function () {
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
  const fs = isNative && Capacitor.Plugins.Filesystem

  const Native = {
    get share () { return Capacitor.Plugins.Share },
    get filesystem () { return fs },
    get network () { return Capacitor.Plugins.Network },
    get preferences () { return Capacitor.Plugins.Preferences },
    get push () { return Capacitor.Plugins.PushNotifications },
    get browser () { return Capacitor.Plugins.Browser },
    get keyboard () { return Capacitor.Plugins.Keyboard }
  }

  function blobToBase64 (blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = reject
      r.readAsDataURL(blob)
    })
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

    // Ouvre une URL externe : navigateur système dans l'app, nouvel onglet sur le web.
    async openExternal (url) {
      if (isNative && Native.browser) {
        await Native.browser.open({ url })
        return
      }
      window.open(url, '_blank')
    },

    // Partage un fichier (feuille de partage Android/iOS) — sur le web, téléchargement simple.
    async shareFile (blob, filename) {
      if (isNative && fs) {
        const base64 = await blobToBase64(blob)
        await fs.writeFile({ path: filename, data: base64, directory: 'CACHE' })
        const uri = await fs.getUri({ path: filename, directory: 'CACHE' })
        try {
          await Native.share.share({ title: 'Nka Bulletin', text: filename, files: [uri.uri] })
          return
        } catch (_) {
          await this.download(blob, filename)
          return
        }
      }
      const file = new File([blob], filename, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Nka Bulletin' })
          return
        } catch (_) {}
      }
      await this.download(blob, filename)
    },

    // Téléchargement : Documents (visible) dans l'app, sinon attribut download.
    async download (blob, filename) {
      if (isNative && fs) {
        const base64 = await blobToBase64(blob)
        await fs.writeFile({ path: filename, data: base64, directory: 'DOCUMENTS' })
        Toast && Toast.show('Enregistré dans Documents')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    },

    // Clavier : demande au WebView de redimensionner la page (si le plugin est présent).
    async ensureKeyboard () {
      if (isNative && Native.keyboard) {
        try {
          await Native.keyboard.setResizeMode({ mode: 'native' })
        } catch (_) {
          try {
            await Native.keyboard.setResizeMode({ mode: 'resize' })
          } catch (_) {}
        }
      }
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
