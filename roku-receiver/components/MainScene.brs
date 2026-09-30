sub init()
  m.api = m.top.findNode("apiTask")
  m.player = m.top.findNode("player")
  m.overlay = m.top.findNode("overlay")
  m.keyboard = m.top.findNode("keyboard")
  m.enterPairing = m.top.findNode("enterPairing")
  m.connect = m.top.findNode("connect")
  m.status = m.top.findNode("status")
  m.nowPlaying = m.top.findNode("nowPlaying")
  m.pollTimer = m.top.findNode("pollTimer")
  m.heartbeatTimer = m.top.findNode("heartbeatTimer")
  m.top.observeField("focusedChild", "keepFocus")
  m.enterPairing.observeField("buttonSelected", "pairingPressed")
  m.connect.observeField("buttonSelected", "connectPressed")
  m.keyboard.observeField("text", "codeChanged")
  m.pollTimer.observeField("fire", "pollSession")
  m.heartbeatTimer.observeField("fire", "heartbeat")
  m.api.observeField("result", "apiResult")
  m.api.observeField("error", "apiError")
  m.player.observeField("state", "videoState")
  m.code = ""
  m.since = 0
  m.requestSerial = 0
  m.lastChannel = 3
  m.api.baseUrl = "https://realsignal-api.tdy1990.workers.dev/api/v3"
  m.keyboard.visible = false
  m.enterPairing.visible = true
  m.connect.visible = false
  m.enterPairing.setFocus(true)
  deepLink = CreateObject("roAppInfo").GetDeepLinkInfo()
  if deepLink <> invalid and deepLink.DoesExist("session")
    m.keyboard.text = deepLink.session
  end if
end sub

sub pairingPressed(event)
  if event.getData() = true
    m.enterPairing.visible = false
    m.keyboard.visible = true
    m.status.text = "Enter the 12-character code from the phone remote, then press BACK."
    m.keyboard.setFocus(true)
  end if
end sub

sub keepFocus(event)
  if m.top.hasFocus() = false then m.top.setFocus(true)
end sub

sub codeChanged(event)
  if event <> invalid and event.getData() <> invalid
    entered = UCase(Trim(event.getData()))
    m.status.text = "Pairing code: " + entered + "  ·  press BACK, then CONNECT"
    if Len(entered) >= 6 then m.connect.visible = true
  end if
end sub

sub connectPressed(event)
  if event.getData() = true
    m.code = UCase(Trim(m.keyboard.text))
    if m.code = ""
      m.status.text = "Enter the pairing code first."
      return
    end if
    m.overlay.visible = false
    m.keyboard.visible = false
    m.enterPairing.visible = false
    m.connect.visible = false
    m.status.text = "Connected · waiting for remote commands"
    request("session-get", {})
    request("heartbeat", {})
  end if
end sub

sub request(kind, payload)
  m.requestSerial = m.requestSerial + 1
  m.api.control = "stop"
  m.api.baseUrl = "https://realsignal-api.tdy1990.workers.dev/api/v3"
  m.api.code = m.code
  m.api.since = m.since
  m.api.requestKind = kind
  m.api.payload = payload
  m.api.runToken = m.requestSerial
  m.api.control = "run"
end sub

sub pollSession(event)
  if m.code <> "" then request("session-get", {})
end sub

sub heartbeat(event)
  if m.code <> "" then request("heartbeat", {})
end sub

sub apiResult(event)
  data = event.getData()
  if data = invalid then return
  if data.DoesExist("sequence") then m.since = data.sequence
  if data.DoesExist("commands")
    for each command in data.commands
      handleCommand(command)
    end for
  end if
  if data.DoesExist("items") and m.pendingTune = true
    m.pendingTune = false
    if data.items.Count() > 0 then playItem(data.items[0])
  end if
end sub

sub apiError(event)
  error = event.getData()
  if error <> invalid and error <> "" then m.status.text = "Receiver waiting · " + error
end sub

sub handleCommand(command)
  if command = invalid then return
  action = UCase(command.action)
  if action = "TUNE"
    m.lastChannel = command.channel
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "NEXT"
    m.lastChannel = m.lastChannel + 1
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "PREV"
    m.lastChannel = Max(1, m.lastChannel - 1)
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "PLAY"
    m.player.control = "play"
  else if action = "PAUSE"
    m.player.control = "pause"
  else if action = "STOP"
    m.player.control = "stop"
  else if action = "POWER"
    m.player.visible = false
    m.player.control = "stop"
  else if action = "MUTE"
    m.player.mute = command.muted
  else if action = "VOLUME"
    m.player.volume = command.level
  else if action = "GUIDE"
    m.status.text = "Guide remains on the phone remote in this preview."
  else if action = "BACK"
    m.status.text = "Back"
  end if
end sub

sub playItem(item)
  mediaUrl = ""
  if item.DoesExist("mediaUrl") then mediaUrl = item.mediaUrl
  if mediaUrl = "" and item.DoesExist("media") and item.media <> invalid and item.media.DoesExist("url") then mediaUrl = item.media.url
  if mediaUrl = ""
    m.status.text = "The server returned no direct playable media."
    return
  end if
  streamFormat = "mp4"
  if LCase(mediaUrl).InStr(".m3u8") > 0 then streamFormat = "hls"
  m.player.content = { url: mediaUrl, streamFormat: streamFormat }
  m.player.visible = true
  m.player.control = "play"
  title = ""
  if item.DoesExist("title") then title = item.title
  m.nowPlaying.text = "CH " + m.lastChannel.ToStr() + "  ·  " + title
end sub

sub videoState(event)
  if event.getData() = "error"
    m.status.text = "This source could not play on Roku; the next verified item can be tried."
  end if
end sub
