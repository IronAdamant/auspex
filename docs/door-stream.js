/* Shared phone/desktop stream + autofill helpers. No Solari HTTP. JWT cannot be extended here. */
(function (root) {
  var MAX_RECONNECT = 3
  var RECONNECT_GRACE_MS = 400

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

  root.AuspexDoorStream = {
    MAX_RECONNECT: MAX_RECONNECT,
    RECONNECT_GRACE_MS: RECONNECT_GRACE_MS,
    doorStreamDisconnectAction: doorStreamDisconnectAction,
    imeAutocomplete: imeAutocomplete,
    imeInputType: imeInputType,
  }
})(typeof window !== "undefined" ? window : globalThis)
