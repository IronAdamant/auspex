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
  }
})(typeof window !== "undefined" ? window : globalThis)
