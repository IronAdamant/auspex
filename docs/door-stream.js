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

  /** Same hosts as cookieHostIsIdp. live.com is exact so onedrive.live.com is not the wall. */
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

  /** Unknown text keeps the warning. A non-IdP https host hides it. */
  function idpWallVisible(observedText) {
    var host = httpsHost(observedText)
    if (!host) return true
    return pageHostIsIdp(host)
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
    IDP_WALL_TEXT: IDP_WALL_TEXT,
    doorStreamDisconnectAction: doorStreamDisconnectAction,
    pageHostIsIdp: pageHostIsIdp,
    httpsHost: httpsHost,
    idpWallVisible: idpWallVisible,
    imeAutocomplete: imeAutocomplete,
    imeInputType: imeInputType,
  }
})(typeof window !== "undefined" ? window : globalThis)
