/* Shared phone/desktop stream + autofill helpers. No Solari HTTP. JWT cannot be extended here. */
(function (root) {
  var MAX_RECONNECT = 3
  var RECONNECT_GRACE_MS = 400
  var IDP_WALL_TEXT = "Still on Microsoft or Google? Finish sign-in, reach the app, then Save."

  function doorStreamDisconnectAction(expired, hidden) {
    if (expired) return "remint"
    if (hidden) return "pause"
    return "reconnect"
  }

  /** Sign-in wall hosts. live.com is exact so onedrive.live.com is not the wall. google.com apex cookies are IdP in the jar only; a page on google.com is not this wall. */
  function hostIs(hostname, domain) {
    var h = String(hostname || "").toLowerCase()
    var d = String(domain || "").toLowerCase()
    return h === d || h.slice(-(d.length + 1)) === "." + d
  }

  function pageHostIsIdp(host) {
    var h = String(host || "").trim().toLowerCase().replace(/^\./, "")
    if (!h) return false
    if (h === "live.com") return true
    return (
      hostIs(h, "login.microsoftonline.com") ||
      hostIs(h, "login.live.com") ||
      hostIs(h, "login.microsoft.com") ||
      hostIs(h, "accounts.google.com")
    )
  }

  function httpsHost(value) {
    var match = String(value || "").match(/https:\/\/([^/?#\s]+)/i)
    if (!match) return ""
    var host = match[1].replace(/:\d+$/, "").replace(/\.$/, "")
    if (!host || host.indexOf("@") !== -1) return ""
    return host.toLowerCase()
  }

  function wallSession(session) {
    return session && typeof session === "object" ? session : null
  }

  function sessionExpired(session) {
    var state = wallSession(session)
    return Boolean(state && (state.expired || state.streamExpired))
  }

  /**
   * Unknown text keeps the warning. A non-IdP https host hides it.
   * stream-expired / remint UI hides it so expiry copy owns the screen.
   * After a non-IdP https host was seen, later empty signals stay hidden.
   * A later IdP host still shows the warning.
   */
  function idpWallVisible(observedText, session) {
    if (sessionExpired(session)) return false
    var host = httpsHost(observedText)
    if (!host) {
      var state = wallSession(session)
      if (state && state.leftIdp) return false
      return true
    }
    return pageHostIsIdp(host)
  }

  function createIdpWallSession() {
    return { leftIdp: false, expired: false }
  }

  /** Remember a non-IdP https host for the rest of this door session. */
  function noteIdpSurface(session, observedText) {
    var state = wallSession(session) || createIdpWallSession()
    if (!sessionExpired(state)) {
      var host = httpsHost(observedText)
      if (host && !pageHostIsIdp(host)) state.leftIdp = true
    }
    return idpWallVisible(observedText, state)
  }

  /** stream-expired / remint: hide the wall for the rest of this page. */
  function expireIdpWall(session) {
    var state = wallSession(session) || createIdpWallSession()
    state.expired = true
    state.streamExpired = true
    return false
  }

  function imeAutocomplete(bulletsOn, otpOn) {
    if (otpOn && !bulletsOn) return "one-time-code"
    return "current-password"
  }

  function imeInputType(bulletsOn) {
    return bulletsOn ? "password" : "text"
  }

  /* noVNC defaults are quality 6 and compression 2. 4/6 is a lighter login
     picture that still shows buttons. This build exposes both setters (0–9). */
  var DOOR_QUALITY_LEVEL = 4
  var DOOR_COMPRESSION_LEVEL = 6
  var DOOR_RESIZE_MIN_PX = 64
  /* 50ms folds a burst into the latest field text. 30ms spaces the keys that
     remain so a slow link does not take a whole paste in one turn.
     Enter, Clear, and Save still flush immediately. */
  var IME_COALESCE_MS = 50
  var IME_KEY_GAP_MS = 30
  var XK_BACKSPACE = 0xff08

  function framebufferPoint(local, rendered, bitmap) {
    if (!(rendered > 0) || !(bitmap > 0)) return 0
    var fb = Math.floor((local * bitmap) / rendered)
    if (fb < 0) return 0
    if (fb > bitmap - 1) return bitmap - 1
    return fb
  }

  function setStyle(style, jsName, cssName, value) {
    if (!style) return
    style[jsName] = value
    if (typeof style.setProperty === "function") style.setProperty(cssName, value)
  }

  /** Map taps from the canvas pixels the finger is on, not a stale scale factor. */
  function installPointerMap(rfb) {
    var display = rfb && rfb._display
    if (!display || display.__auspexPointer || typeof display.absX !== "function") return false
    var canvas = display._target
    if (!canvas || typeof canvas.getBoundingClientRect !== "function") return false
    if (typeof canvas.width !== "number" || typeof canvas.height !== "number") return false
    display.__auspexPointer = true
    display.absX = function (local) {
      var rect = canvas.getBoundingClientRect() || {}
      return framebufferPoint(local, rect.width, canvas.width)
    }
    display.absY = function (local) {
      var rect = canvas.getBoundingClientRect() || {}
      return framebufferPoint(local, rect.height, canvas.height)
    }
    return true
  }

  function settleDoorChrome(rfb) {
    var screen = rfb && rfb._screen
    if (screen && screen.style) {
      screen.style.overflow = "hidden"
      setStyle(screen.style, "touchAction", "touch-action", "manipulation")
    }
    var canvas = rfb && rfb._canvas
    if (canvas && canvas.style) setStyle(canvas.style, "touchAction", "touch-action", "manipulation")
  }

  /**
   * One SetDesktopSize when the stage has a real size, then stop.
   * ResizeObserver keeps calling this while the flag stays on; clearing the
   * flag after the first real send is the gate. A 0×0 box does not count.
   */
  function gateResizeSession(rfb) {
    if (!rfb || typeof rfb._requestRemoteResize !== "function") {
      if (rfb) rfb.resizeSession = false
      return false
    }
    var orig = rfb._requestRemoteResize
    rfb._requestRemoteResize = function () {
      var size = null
      if (this._screen && typeof this._screen.getBoundingClientRect === "function") {
        size = this._screen.getBoundingClientRect()
      }
      var w = size && size.width
      var h = size && size.height
      var canSend = Boolean(this._resizeSession && this._supportsSetDesktopSize && !this._viewOnly)
      var ready = Boolean(canSend && w >= DOOR_RESIZE_MIN_PX && h >= DOOR_RESIZE_MIN_PX)
      if (canSend && !ready) return
      var ret = orig.apply(this, arguments)
      if (ready) this._resizeSession = false
      return ret
    }
    rfb.resizeSession = true
    return true
  }

  function applyDoorView(rfb) {
    if (!rfb) return { mapped: false, resizeGated: false }
    rfb.scaleViewport = true
    rfb.qualityLevel = DOOR_QUALITY_LEVEL
    rfb.compressionLevel = DOOR_COMPRESSION_LEVEL
    var mapped = installPointerMap(rfb)
    settleDoorChrome(rfb)
    return { mapped: mapped, resizeGated: gateResizeSession(rfb) }
  }

  function planImeSteps(prev, next) {
    var from = String(prev == null ? "" : prev)
    var to = String(next == null ? "" : next)
    var steps = []
    var i = 0
    var max = Math.min(from.length, to.length)
    while (i < max && from.charAt(i) === to.charAt(i)) i++
    var remote = from
    var k
    for (k = from.length; k > i; k--) {
      remote = remote.slice(0, -1)
      steps.push({ keysym: XK_BACKSPACE, code: "Backspace", remote: remote })
    }
    for (var n = i; n < to.length; n++) {
      var ch = to.charAt(n)
      remote += ch
      var cp = ch.codePointAt(0) || 0
      var keysym = cp < 0x80 ? cp : (0x01000000 | cp)
      steps.push({ keysym: keysym, code: "Unidentified", remote: remote })
    }
    return steps
  }

  function createImeCoalescer(opts) {
    opts = opts || {}
    var send = opts.send
    var schedule = opts.schedule
    var cancel = opts.cancel
    var coalesceMs = opts.coalesceMs > 0 ? opts.coalesceMs : IME_COALESCE_MS
    var gapMs = opts.gapMs > 0 ? opts.gapMs : IME_KEY_GAP_MS
    var remote = ""
    var desired = ""
    var queued = []
    var coalesceId = null
    var gapId = null
    var afterDrain = null
    var sendFails = 0
    var SEND_RETRY_CAP = 40

    function clearCoalesce() {
      if (coalesceId != null) {
        cancel(coalesceId)
        coalesceId = null
      }
    }
    function clearGap() {
      if (gapId != null) {
        cancel(gapId)
        gapId = null
      }
    }
    function armGap() {
      if (gapId != null) return
      gapId = schedule(pump, gapMs)
    }
    function pump() {
      gapId = null
      if (!queued.length && remote !== desired) queued = planImeSteps(remote, desired)
      if (!queued.length) {
        var done = afterDrain
        afterDrain = null
        if (done) done()
        return
      }
      var step = queued[0]
      if (send(step.keysym, step.code) === false) {
        sendFails += 1
        if (sendFails < SEND_RETRY_CAP) armGap()
        return
      }
      sendFails = 0
      queued.shift()
      remote = step.remote
      if (queued.length || remote !== desired || afterDrain) armGap()
    }
    function armCoalesce() {
      if (gapId != null || coalesceId != null) return
      coalesceId = schedule(function () {
        coalesceId = null
        if (!queued.length) queued = planImeSteps(remote, desired)
        pump()
      }, coalesceMs)
    }
    function drainSync() {
      clearCoalesce()
      clearGap()
      sendFails = 0
      queued = planImeSteps(remote, desired)
      for (var i = 0; i < queued.length; i++) {
        if (send(queued[i].keysym, queued[i].code) === false) {
          queued = queued.slice(i)
          return false
        }
        remote = queued[i].remote
      }
      queued = []
      return true
    }

    return {
      note: function (next) {
        desired = String(next == null ? "" : next)
        queued = []
        sendFails = 0
        if (gapId != null) return
        armCoalesce()
      },
      flushPending: function () {
        if (!drainSync()) armGap()
      },
      flushCommit: function (done) {
        if (!drainSync()) {
          afterDrain = function () {
            desired = ""
            remote = ""
            queued = []
            if (done) done()
          }
          armGap()
          return
        }
        desired = ""
        remote = ""
        if (done) done()
      },
      erase: function () {
        desired = ""
        if (!drainSync()) armGap()
      },
      cancel: function () {
        clearCoalesce()
        clearGap()
        queued = []
        desired = ""
        remote = ""
        afterDrain = null
        sendFails = 0
      },
    }
  }

  root.AuspexDoorStream = {
    MAX_RECONNECT: MAX_RECONNECT,
    RECONNECT_GRACE_MS: RECONNECT_GRACE_MS,
    IDP_WALL_TEXT: IDP_WALL_TEXT,
    doorStreamDisconnectAction: doorStreamDisconnectAction,
    pageHostIsIdp: pageHostIsIdp,
    httpsHost: httpsHost,
    idpWallVisible: idpWallVisible,
    createIdpWallSession: createIdpWallSession,
    noteIdpSurface: noteIdpSurface,
    expireIdpWall: expireIdpWall,
    imeAutocomplete: imeAutocomplete,
    imeInputType: imeInputType,
    DOOR_QUALITY_LEVEL: DOOR_QUALITY_LEVEL,
    DOOR_COMPRESSION_LEVEL: DOOR_COMPRESSION_LEVEL,
    DOOR_RESIZE_MIN_PX: DOOR_RESIZE_MIN_PX,
    IME_COALESCE_MS: IME_COALESCE_MS,
    IME_KEY_GAP_MS: IME_KEY_GAP_MS,
    framebufferPoint: framebufferPoint,
    planImeSteps: planImeSteps,
    applyDoorView: applyDoorView,
    createImeCoalescer: createImeCoalescer,
  }
})(typeof window !== "undefined" ? window : globalThis)
