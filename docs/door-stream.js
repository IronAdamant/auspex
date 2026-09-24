/* Shared phone/desktop stream + autofill helpers. No Solari HTTP. JWT cannot be extended here. */
(function (root) {
  var MAX_RECONNECT = 3
  var RECONNECT_GRACE_MS = 400
  var PREVIEW_ZOOM_MIN = 1
  var PREVIEW_ZOOM_MAX = 2.5
  var PREVIEW_ZOOM_STEP = 0.25
  var PREVIEW_ZOOM_DEFAULT = 1

  function doorStreamDisconnectAction(expired, hidden, attempts, maxAttempts) {
    if (expired) return "remint"
    if (hidden) return "pause"
    if (attempts >= (maxAttempts || MAX_RECONNECT)) return "remint"
    return "reconnect"
  }

  function imeAutocomplete(bulletsOn, otpOn) {
    if (otpOn && !bulletsOn) return "one-time-code"
    return "current-password"
  }

  function imeInputType(bulletsOn) {
    return bulletsOn ? "password" : "text"
  }

  function clampPreviewZoom(value) {
    if (!Number.isFinite(value)) return PREVIEW_ZOOM_DEFAULT
    var clamped = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, value))
    var steps = Math.round(clamped / PREVIEW_ZOOM_STEP)
    return Number((steps * PREVIEW_ZOOM_STEP).toFixed(2))
  }

  function nextPreviewZoom(current, direction) {
    var delta = direction < 0 ? -PREVIEW_ZOOM_STEP : PREVIEW_ZOOM_STEP
    return clampPreviewZoom(clampPreviewZoom(current) + delta)
  }

  function previewZoomLabel(scale) {
    return Math.round(clampPreviewZoom(scale) * 100) + "%"
  }

  function bindPreviewZoom(getLocked, viewport, zoomOut, zoomIn, zoomReset) {
    var zoom = PREVIEW_ZOOM_DEFAULT
    function apply(next) {
      zoom = clampPreviewZoom(next)
      if (viewport && viewport.style && typeof viewport.style.setProperty === "function") {
        viewport.style.setProperty("--preview-zoom", String(zoom))
      }
      if (zoomReset) zoomReset.textContent = previewZoomLabel(zoom)
      var locked = Boolean(getLocked && getLocked())
      if (zoomOut) zoomOut.disabled = locked || zoom <= PREVIEW_ZOOM_MIN
      if (zoomIn) zoomIn.disabled = locked || zoom >= PREVIEW_ZOOM_MAX
      if (zoomReset) zoomReset.disabled = locked
      return zoom
    }
    function onClick(fn) {
      return function () {
        if (getLocked && getLocked()) return
        fn()
      }
    }
    if (zoomOut && zoomOut.addEventListener) {
      zoomOut.addEventListener("click", onClick(function () { apply(nextPreviewZoom(zoom, -1)) }))
    }
    if (zoomIn && zoomIn.addEventListener) {
      zoomIn.addEventListener("click", onClick(function () { apply(nextPreviewZoom(zoom, 1)) }))
    }
    if (zoomReset && zoomReset.addEventListener) {
      zoomReset.addEventListener("click", onClick(function () { apply(PREVIEW_ZOOM_DEFAULT) }))
    }
    apply(PREVIEW_ZOOM_DEFAULT)
    return { get: function () { return zoom }, apply: apply }
  }

  root.AuspexDoorStream = {
    MAX_RECONNECT: MAX_RECONNECT,
    RECONNECT_GRACE_MS: RECONNECT_GRACE_MS,
    PREVIEW_ZOOM_MIN: PREVIEW_ZOOM_MIN,
    PREVIEW_ZOOM_MAX: PREVIEW_ZOOM_MAX,
    PREVIEW_ZOOM_STEP: PREVIEW_ZOOM_STEP,
    PREVIEW_ZOOM_DEFAULT: PREVIEW_ZOOM_DEFAULT,
    doorStreamDisconnectAction: doorStreamDisconnectAction,
    imeAutocomplete: imeAutocomplete,
    imeInputType: imeInputType,
    clampPreviewZoom: clampPreviewZoom,
    nextPreviewZoom: nextPreviewZoom,
    previewZoomLabel: previewZoomLabel,
    bindPreviewZoom: bindPreviewZoom,
  }
})(typeof window !== "undefined" ? window : globalThis)
