/* Shared phone/desktop stream + autofill helpers. No Solari HTTP. JWT cannot be extended here. */
(function (root) {
  var MAX_RECONNECT = 3
  var RECONNECT_GRACE_MS = 400

  function doorStreamDisconnectAction(expired, hidden) {
    if (expired) return "remint"
    if (hidden) return "pause"
    return "reconnect"
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
    doorStreamDisconnectAction: doorStreamDisconnectAction,
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
