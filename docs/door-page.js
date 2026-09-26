/* Phone login door. No Solari HTTP. JWT cannot be extended here.
   Clear empties the whole typing field. Enter still sends Enter.
   liveSiteUrl() is always empty: this page cannot read the remote address bar. */
(function (root) {
  function savePasteLine(name) {
    name = String(name || "").trim() || "<yours>"
    return "I tapped Save on the Auspex phone page for profile " + name + ".\n" +
      "Run: npx auspex await-login --profile " + name + " --save-editor\n" +
      "(MCP: auspex_await_login with saveEditor true).\n" +
      "Clipboard Save is not the jar. That command POSTs Solari editor/save. If an await is already running, do not kill it; this line signals that process.\n" +
      "Save before the phone countdown hits zero. A sign-in longer than about 5 minutes needs a fresh auspex login for the final Save window. Auspex cannot lengthen the Solari token.\n" +
      "Then: npx auspex finalize-login --profile " + name + " --url <the URL the logged-in app lands on> --expect \"<unique logged-in text>\".\n" +
      "Never open Solari's editor on a phone (GET editor HTTP 401).\n" +
      "editorSave 200 with editorFold no-cdp → finalize-login NOW, even if the VNC JWT is past. --save-editor does not refresh folded sessionStorage unless editorFold.ok. Do not --verify-with-profile on that fold.\n" +
      "A different product is hostChanged → remint. A same-product rebrand is adopted (SkySQL and MariaDB).\n" +
      "Console Save stores cookies only. It cannot read sessionStorage (the handoff editor has no Playwright attach). An app already on screen is not saved by this button, and finalize-login cannot recover an IdP-only jar. Expect must be unique to the logged-in app surface, not marketing."
  }

  function liveSiteUrl() {
    // noVNC is a picture of Chrome. This page cannot read the remote address bar
    // (page.url()). Do not parse the password field. await-login and finalize-login
    // compare storage origins / cookie hosts and, when CDP exists, page.url().
    return ""
  }

  function httpsSite(value) {
    var text = String(value || "").trim()
    var match = text.match(/^https:\/\/([^/?#\s]+)/i)
    if (!match) return ""
    var host = match[1]
    if (!host || host.indexOf("@") !== -1) return ""
    return "https://" + host
  }

  function doorSiteUrl(live, minted, typed) {
    if (typed && typed === typed) { /* IME is credentials, not a site picker */ }
    var observed = httpsSite(live)
    if (observed) return observed
    return httpsSite(minted)
  }

  function stripSecret(line, secret, protectedSpans, profileName) {
    if (!secret || secret === profileName) return line
    var text = String(line == null ? "" : line)
    var spans = Array.isArray(protectedSpans) ? protectedSpans : []
    var hay = text + "\0" + String(secret)
    function markFor(i) {
      var n = i
      var m
      do {
        m = "@@AUSPEX_KEEP_" + n + "@@"
        n += 97
      } while (hay.indexOf(m) !== -1)
      return m
    }
    var mark0 = markFor(0)
    var mark1 = markFor(1)
    var span0 = spans[0] || ""
    var span1 = spans[1] || ""
    if (span0) text = text.split(span0).join(mark0)
    if (span1) text = text.split(span1).join(mark1)
    text = text.split(secret).join("")
    if (span1) text = text.split(mark1).join(span1)
    if (span0) text = text.split(mark0).join(span0)
    return text
  }

  function parseUnixSeconds(value) {
    if (value == null || value === "") return null
    var raw = String(value).trim()
    if (/^\d+(\.\d+)?$/.test(raw)) {
      var n = Number(raw)
      if (!isFinite(n) || n <= 0) return null
      return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
    }
    var parsed = Date.parse(raw)
    return isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }

  function jwtExpSeconds(rawToken) {
    var parts = String(rawToken || "").split(".")
    var earliest = null
    var limit = parts.length < 2 ? parts.length : 2
    for (var i = 0; i < limit; i++) {
      if (!parts[i]) continue
      try {
        var b64 = parts[i].replace(/-/g, "+").replace(/_/g, "/")
        while (b64.length % 4) b64 += "="
        var payload = JSON.parse(atob(b64))
        var exp = parseUnixSeconds(payload && payload.exp)
        if (exp) earliest = earliest == null ? exp : Math.min(earliest, exp)
      } catch (e) {}
    }
    return earliest
  }

  function start() {
    var viewerLabel = "Phone"
    var XK_BACKSPACE = 0xff08
    var XK_TAB = 0xff09
    var XK_RETURN = 0xff0d
    var params = new URLSearchParams(location.hash.replace(/^#/, ""))
    var token = params.get("v") || ""
    var profileName = params.get("n") || ""
    var status = document.getElementById("status")
    var boot = document.getElementById("boot")
    var bootText = document.getElementById("bootText")
    var ttl = document.getElementById("ttl")
    var expired = document.getElementById("expired")
    var expiredTitle = document.getElementById("expiredTitle")
    var expiredText = document.getElementById("expiredText")
    var ime = document.getElementById("ime")
    var paste = document.getElementById("paste")
    var scratch = document.getElementById("copyScratch")
    var copied = document.getElementById("copied")
    var screen = document.getElementById("screen")
    var save = document.getElementById("save")
    var clearBtn = document.getElementById("clear")
    var enter = document.getElementById("enter")
    var bullets = document.getElementById("bullets")
    var otpMode = document.getElementById("otpMode")
    var imeUser = document.getElementById("imeUser")
    var imeForm = document.getElementById("imeForm")
    var rfb = null
    var last = ""
    var clearing = false
    var bootTimer = null
    var tickTimer = null
    var reconnectTimer = null
    var locked = false
    var streamConnected = false
    var streamPaused = false
    var sawConnect = false
    var reconnecting = false
    var ignoreDisconnect = false
    var reconnectAttempts = 0
    var idpSession = { leftIdp: false, expired: false }
    var Door = (root.AuspexDoorStream) || {
      MAX_RECONNECT: 3,
      RECONNECT_GRACE_MS: 400,
      doorStreamDisconnectAction: function (expiredFlag, hidden) {
        if (expiredFlag) return "remint"
        if (hidden) return "pause"
        return "reconnect"
      },
      imeAutocomplete: function (bulletsOn, otpOn) {
        if (otpOn && !bulletsOn) return "one-time-code"
        return "current-password"
      },
      imeInputType: function (bulletsOn) { return bulletsOn ? "password" : "text" },
    }

    function setStatus(text, err) {
      status.textContent = text
      status.className = err ? "err" : ""
    }

    function applyIdpWall(show) {
      var wall = document.getElementById("idpWall")
      if (!wall) return
      if (show) wall.classList.remove("hidden")
      else wall.classList.add("hidden")
    }

    function noteRemoteSurface(text) {
      if (locked || idpSession.expired) {
        applyIdpWall(false)
        return
      }
      var show = true
      if (typeof Door.noteIdpSurface === "function") show = Door.noteIdpSurface(idpSession, text)
      else if (typeof Door.idpWallVisible === "function") show = Door.idpWallVisible(text, idpSession)
      applyIdpWall(show)
    }

    function setBoot(text, hide) {
      bootText.textContent = text
      if (hide) boot.classList.add("hidden")
      else boot.classList.remove("hidden")
    }

    function remintLine(reason) {
      var n = String(profileName || "").trim()
      var flag = n ? " --profile " + n : ""
      var statusName = reason || "stream-expired"
      return "status " + statusName + ". Remint: npx auspex login" + flag + " (nextCall auspex_login). Do not reuse this page."
    }

    function resolveExpirySeconds() {
      var fromHash = parseUnixSeconds(params.get("exp"))
      if (fromHash) return fromHash
      return jwtExpSeconds(token)
    }

    function formatRemain(sec) {
      if (sec < 0) sec = 0
      var m = Math.floor(sec / 60)
      var s = sec % 60
      return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s
    }

    function clearLocalSecrets() {
      clearing = true
      if (ime) ime.value = ""
      if (imeUser) imeUser.value = ""
      last = ""
      clearing = false
    }

    function lockUi(title, message) {
      if (locked) return
      locked = true
      document.body.classList.add("locked")
      if (ime) ime.disabled = true
      if (save) save.disabled = true
      if (clearBtn) clearBtn.disabled = true
      if (enter) enter.disabled = true
      if (bullets) bullets.disabled = true
      if (otpMode) otpMode.disabled = true
      if (imeUser) imeUser.disabled = true
      clearLocalSecrets()
      if (screen && screen.style) screen.style.pointerEvents = "none"
      expiredTitle.textContent = title
      expiredText.textContent = message
      expired.classList.add("show")
      reconnecting = false
      ttl.textContent = title
      ttl.className = "dead"
      setStatus(message, true)
      setBoot(title, false)
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
      if (bootTimer) { clearInterval(bootTimer); bootTimer = null }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      ignoreDisconnect = true
      if (rfb && typeof rfb.disconnect === "function") {
        try { rfb.disconnect() } catch (e) {}
      }
      rfb = null
      streamConnected = false
      if (typeof Door.expireIdpWall === "function") Door.expireIdpWall(idpSession)
      else idpSession.expired = true
      applyIdpWall(false)
    }

    function copyOnTap(text) {
      scratch.value = text
      scratch.removeAttribute("readonly")
      scratch.focus()
      scratch.setSelectionRange(0, text.length)
      var ok = false
      try { ok = document.execCommand("copy") } catch (e) {}
      scratch.setAttribute("readonly", "readonly")
      scratch.blur()
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { ok = true }).catch(function () {})
      }
      return ok
    }

    function showCopied() {
      copied.classList.add("show")
      save.textContent = "Copied"
      save.classList.add("copied")
      setStatus("Copied. Paste it in your AI chat, then stay on this page.")
    }

    save.addEventListener("click", function () {
      if (locked) return
      var typed = String(ime && ime.value || "")
      var template = savePasteLine(profileName)
      var siteUrl = doorSiteUrl(liveSiteUrl(), params.get("u"))
      var siteClause = siteUrl ? " Site URL: " + siteUrl + "." : ""
      var line = stripSecret(template + siteClause, typed, [template, siteClause], profileName)
      clearLocalSecrets()
      paste.value = line
      copyOnTap(line)
      paste.classList.add("show")
      showCopied()
    })

    var expSec = resolveExpirySeconds()
    if (!expSec) {
      lockUi("Link expiry unknown — remint", remintLine())
      return
    }

    function tick() {
      if (locked) return
      var left = expSec - Math.floor(Date.now() / 1000)
      if (left <= 0) {
        lockUi("This login link has expired", remintLine())
        return
      }
      if (left <= 90) {
        ttl.textContent = "Save now. This link dies in " + formatRemain(left) + " · VNC ~5 min"
        ttl.className = "warn"
      } else {
        ttl.textContent = "Save before this dies · " + formatRemain(left) + " left · VNC ~5 min"
        ttl.className = ""
      }
    }
    tick()
    tickTimer = setInterval(tick, 1000)
    if (locked) return

    if (!token) {
      lockUi("This page needs a live link from auspex login", remintLine())
      return
    }

    function sendKey(keysym, code) {
      if (locked || !rfb || typeof rfb.sendKey !== "function") return
      rfb.sendKey(keysym, code)
    }

    function sendChar(ch) {
      var cp = ch.codePointAt(0)
      if (!cp) return
      var keysym = cp < 0x80 ? cp : (0x01000000 | cp)
      sendKey(keysym, "Unidentified")
    }

    function sendBackspace() {
      sendKey(XK_BACKSPACE, "Backspace")
    }

    function sendDiff(prev, next) {
      var i = 0
      var max = Math.min(prev.length, next.length)
      while (i < max && prev.charAt(i) === next.charAt(i)) i++
      for (var k = prev.length; k > i; k--) sendBackspace()
      for (var n = i; n < next.length; n++) sendChar(next.charAt(n))
    }

    function applyFieldMode() {
      if (!ime) return
      var keep = ime.value
      var bulletsOn = Boolean(bullets && bullets.checked)
      var otpOn = Boolean(otpMode && otpMode.checked)
      clearing = true
      ime.type = Door.imeInputType(bulletsOn)
      if (typeof ime.setAttribute === "function") {
        ime.setAttribute("autocomplete", Door.imeAutocomplete(bulletsOn, otpOn))
      }
      if (ime.value !== keep) ime.value = keep
      last = keep
      clearing = false
    }

    if (imeForm) {
      imeForm.addEventListener("submit", function (e) {
        if (e && e.preventDefault) e.preventDefault()
        return false
      })
    }

    if (ime) {
      ime.addEventListener("input", function () {
        if (locked || clearing) return
        var next = ime.value
        sendDiff(last, next)
        last = next
      })
      ime.addEventListener("keydown", function (e) {
        if (locked) { e.preventDefault(); return }
        if (e.key === "Enter") {
          e.preventDefault()
          sendKey(XK_RETURN, "Enter")
          clearLocalSecrets()
        } else if (e.key === "Tab") {
          e.preventDefault()
          sendKey(XK_TAB, "Tab")
        } else if (e.key === "Backspace" && ime.value === "") {
          e.preventDefault()
          sendBackspace()
        }
      })
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (locked || !ime) return
        if (ime.value) {
          ime.value = ""
          sendDiff(last, "")
          last = ""
        }
        ime.focus()
      })
    }
    if (enter) {
      enter.addEventListener("click", function () {
        if (locked) return
        sendKey(XK_RETURN, "Enter")
        clearLocalSecrets()
        ime.focus()
      })
    }
    if (bullets) {
      bullets.addEventListener("change", function () {
        if (locked) return
        if (bullets.checked && otpMode) otpMode.checked = false
        applyFieldMode()
        if (ime && !ime.disabled) ime.focus()
      })
    }
    if (otpMode) {
      otpMode.addEventListener("change", function () {
        if (locked) return
        if (otpMode.checked && bullets) bullets.checked = false
        applyFieldMode()
        if (ime && !ime.disabled) ime.focus()
      })
    }
    var RFB = (root.NoVNCRFB && root.NoVNCRFB.default) || root.NoVNCRFB
    if (typeof RFB !== "function") {
      setBoot(viewerLabel + " viewer failed to load. Remint auspex login.", false)
      setStatus(viewerLabel + " viewer failed to load. Remint auspex login.", true)
      return
    }

    function hideBootWhenReady() {
      var tries = 0
      if (bootTimer) clearInterval(bootTimer)
      bootTimer = setInterval(function () {
        if (locked) { clearInterval(bootTimer); bootTimer = null; return }
        tries++
        var canvas = screen.querySelector("canvas")
        if (canvas && canvas.width > 2 && canvas.height > 2) {
          clearInterval(bootTimer)
          bootTimer = null
          setBoot("Ready", true)
          setStatus("Connected.")
          if (ime) ime.focus()
        } else if (tries === 16) {
          setBoot("Still opening remote Chrome…")
        } else if (tries > 60) {
          clearInterval(bootTimer)
          bootTimer = null
          lockUi("Remote Chrome opened with no frames", remintLine("handshake-no-frames"))
        }
      }, 500)
    }

    var ws = "wss://api.getsolari.com/vnc-proxy/ws?token=" + encodeURIComponent(token)

    function streamStillLive() {
      return Boolean(expSec && expSec - Math.floor(Date.now() / 1000) > 0)
    }

    function pageHidden() {
      if (typeof document.visibilityState === "string") return document.visibilityState === "hidden"
      return Boolean(document.hidden)
    }

    function remintClosed() {
      lockUi(
        "The remote Chrome closed. A new login link is required.",
        "The remote Chrome closed. A new login link is required. " + remintLine()
      )
    }

    function pauseStream() {
      streamPaused = true
      streamConnected = false
      setBoot("Remote Chrome paused. Return to this tab to reconnect.", false)
      setStatus("Paused. Come back before the link timer ends to reconnect.")
      ttl.className = "warn"
    }

    function closeRfb() {
      ignoreDisconnect = true
      if (rfb && typeof rfb.disconnect === "function") {
        try { rfb.disconnect() } catch (e) {}
      }
      rfb = null
      ignoreDisconnect = false
    }

    function clearScreenMount() {
      if (!screen || typeof screen.removeChild !== "function") return
      while (screen.firstChild) screen.removeChild(screen.firstChild)
    }

    function followDisconnect() {
      if (locked || streamConnected) return
      var action = Door.doorStreamDisconnectAction(
        !streamStillLive(),
        pageHidden(),
        reconnectAttempts,
        Door.MAX_RECONNECT
      )
      if (action === "pause") pauseStream()
      else if (action === "reconnect") reconnectStream()
      else remintClosed()
    }

    function reconnectStream() {
      if (locked || reconnecting) return
      if (!streamStillLive()) {
        remintClosed()
        return
      }
      reconnecting = true
      reconnectAttempts += 1
      streamPaused = false
      streamConnected = false
      setBoot("Reconnecting to remote Chrome…", false)
      setStatus("Reconnecting with the same VNC token. stream-expired only when the link timer is gone.")
      closeRfb()
      clearScreenMount()
      openRfb()
    }

    function scheduleDisconnectFollowup() {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null
        followDisconnect()
      }, Door.RECONNECT_GRACE_MS)
    }

    function onPageHidden() {
      if (locked || !streamStillLive() || !sawConnect || streamPaused) return
      pauseStream()
      closeRfb()
    }

    function onPageVisible() {
      if (locked) return
      if (!streamStillLive()) {
        if (sawConnect || streamPaused) remintClosed()
        return
      }
      if (!sawConnect && !streamPaused) return
      if (streamConnected && !streamPaused) return
      if (reconnecting) return
      reconnectAttempts = 0
      streamPaused = false
      reconnectStream()
    }

    function openRfb() {
      try {
        rfb = new RFB(screen, ws)
        rfb.scaleViewport = true
        rfb.resizeSession = true
        rfb.background = "#0b0f14"
        rfb.addEventListener("clipboard", function (ev) {
          noteRemoteSurface(ev && ev.detail && ev.detail.text)
        })
        rfb.addEventListener("desktopname", function (ev) {
          var detail = ev && ev.detail
          var name = detail && (detail.name || detail)
          noteRemoteSurface(typeof name === "string" ? name : "")
        })
        rfb.addEventListener("connect", function () {
          if (locked) {
            closeRfb()
            return
          }
          streamConnected = true
          streamPaused = false
          sawConnect = true
          reconnecting = false
          reconnectAttempts = 0
          setBoot("Opening Chromium…")
          hideBootWhenReady()
        })
        rfb.addEventListener("securityfailure", function () {
          if (locked || ignoreDisconnect) return
          lockUi("VNC handshake failed", remintLine("handshake-no-frames"))
        })
        rfb.addEventListener("disconnect", function () {
          if (locked || ignoreDisconnect) return
          streamConnected = false
          scheduleDisconnectFollowup()
        })
      } catch (err) {
        setBoot("Could not open the remote Chrome. Remint auspex login.", false)
        setStatus("Could not open the remote Chrome. Remint auspex login.", true)
      }
    }

    document.addEventListener("visibilitychange", function () {
      if (pageHidden()) onPageHidden()
      else onPageVisible()
    })
    document.addEventListener("pagehide", function () {
      onPageHidden()
    })
    root.addEventListener("pageshow", function () {
      if (pageHidden()) return
      onPageVisible()
    })

    try {
      openRfb()
    } catch (err) {
      setBoot("Could not open the remote Chrome. Remint auspex login.", false)
      setStatus("Could not open the remote Chrome. Remint auspex login.", true)
    }
  }

  root.AuspexDoorPage = {
    savePasteLine: savePasteLine,
    liveSiteUrl: liveSiteUrl,
    httpsSite: httpsSite,
    doorSiteUrl: doorSiteUrl,
    stripSecret: stripSecret,
    parseUnixSeconds: parseUnixSeconds,
    jwtExpSeconds: jwtExpSeconds,
    start: start,
  }
})(typeof window !== "undefined" ? window : globalThis)
