sub init()
  m.api = m.top.findNode("apiTask")
  m.player = m.top.findNode("player")
  m.overlay = m.top.findNode("overlay")
  m.brand = m.top.findNode("brand")
  m.headline = m.top.findNode("headline")
  m.codeDisplay = m.top.findNode("codeDisplay")
  m.clearCode = m.top.findNode("clearCode")
  m.backspaceCode = m.top.findNode("backspaceCode")
  m.connect = m.top.findNode("connect")
  m.status = m.top.findNode("status")
  m.hint = m.top.findNode("hint")
  m.nowPlaying = m.top.findNode("nowPlaying")
  m.pollTimer = m.top.findNode("pollTimer")
  m.heartbeatTimer = m.top.findNode("heartbeatTimer")
  m.focusTimer = m.top.findNode("focusTimer")
  m.clearCode.observeField("buttonSelected", "clearPressed")
  m.backspaceCode.observeField("buttonSelected", "backspacePressed")
  m.connect.observeField("buttonSelected", "connectPressed")
  m.keyIds = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"]
  for each keyId in m.keyIds
    keyNode = m.top.findNode("key" + keyId)
    keyNode.focusable = false
  end for
  m.top.findNode("key0").observeField("buttonSelected", "key0Pressed")
  m.top.findNode("key1").observeField("buttonSelected", "key1Pressed")
  m.top.findNode("key2").observeField("buttonSelected", "key2Pressed")
  m.top.findNode("key3").observeField("buttonSelected", "key3Pressed")
  m.top.findNode("key4").observeField("buttonSelected", "key4Pressed")
  m.top.findNode("key5").observeField("buttonSelected", "key5Pressed")
  m.top.findNode("key6").observeField("buttonSelected", "key6Pressed")
  m.top.findNode("key7").observeField("buttonSelected", "key7Pressed")
  m.top.findNode("key8").observeField("buttonSelected", "key8Pressed")
  m.top.findNode("key9").observeField("buttonSelected", "key9Pressed")
  m.top.findNode("keyA").observeField("buttonSelected", "keyAPressed")
  m.top.findNode("keyB").observeField("buttonSelected", "keyBPressed")
  m.top.findNode("keyC").observeField("buttonSelected", "keyCPressed")
  m.top.findNode("keyD").observeField("buttonSelected", "keyDPressed")
  m.top.findNode("keyE").observeField("buttonSelected", "keyEPressed")
  m.top.findNode("keyF").observeField("buttonSelected", "keyFPressed")
  m.clearCode.focusable = false
  m.backspaceCode.focusable = false
  m.connect.focusable = false
  m.pollTimer.observeField("fire", "pollSession")
  m.heartbeatTimer.observeField("fire", "heartbeat")
  m.focusTimer.observeField("fire", "initialFocus")
  m.api.observeField("result", "apiResult")
  m.api.observeField("error", "apiError")
  m.player.observeField("state", "videoState")
  m.top.observeField("isScreenVisible", "screenVisible")
  m.code = ""
  m.codeBuffer = ""
  m.focusIndex = 0
  m.since = 0
  m.requestSerial = 0
  m.lastChannel = 3
  m.rotation = 0
  m.sessionStarted = false
  m.api.baseUrl = "https://realsignal-api.tdy1990.workers.dev/api/v3"
  m.top.focusable = true
  m.connect.visible = false
  m.status.text = "Use the arrows and OK to enter the 12-character pairing code."
  m.top.setFocus(true)
  focusSelection(0)
  m.focusTimer.control = "start"
end sub

sub initialFocus(event)
  if m.code = ""
    m.top.setFocus(true)
    focusSelection(0)
  end if
end sub

sub screenVisible(event)
  if event <> invalid and event.getData() = true and m.code = ""
    m.top.setFocus(true)
    focusSelection(0)
  end if
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
  if press = false or m.code <> "" then return false

  normalized = LCase(key)
  if normalized = "left"
    if m.focusIndex > 16 then
      focusSelection(m.focusIndex - 1)
    else if m.focusIndex = 16 then
      focusSelection(16)
    else
      focusSelection(m.focusIndex - 1)
    end if
    return true
  else if normalized = "right"
    if m.focusIndex < 16 then
      focusSelection(m.focusIndex + 1)
    else if m.connect.visible
      focusSelection(m.focusIndex + 1)
    else
      focusSelection(17)
    end if
    return true
  else if normalized = "up"
    if m.focusIndex >= 16 then
      focusSelection(m.focusIndex - 4)
    else
      focusSelection(m.focusIndex - 4)
    end if
    return true
  else if normalized = "down"
    nextIndex = m.focusIndex + 4
    if m.focusIndex >= 12 and m.focusIndex <= 15
      column = m.focusIndex - 12
      if column = 0
        nextIndex = 16
      else if column = 1
        nextIndex = 17
      else if m.connect.visible
        nextIndex = 18
      else
        nextIndex = 17
      end if
    else if m.focusIndex >= 16
      nextIndex = m.focusIndex
    end if
    focusSelection(nextIndex)
    return true
  else if normalized = "back" or normalized = "backspace"
    removeLastCodeCharacter()
    return true
  else if normalized = "ok" or normalized = "select" or normalized = "enter"
    if m.focusIndex = 16
      clearCodeEntry()
    else if m.focusIndex = 17
      removeLastCodeCharacter()
    else if m.focusIndex = 18
      connectNow()
    else
      appendCode(m.keyIds[m.focusIndex])
    end if
    return true
  end if

  return false
end function

sub focusSelection(index)
  limit = 17
  if m.connect.visible then limit = 18
  if index < 0 then index = 0
  if index > limit then index = limit
  m.focusIndex = index
  if index < m.keyIds.Count()
    m.status.text = "Selected key " + m.keyIds[index] + " · press OK"
  else if index = 16
    m.status.text = "Selected CLEAR · press OK"
  else if index = 17
    m.status.text = "Selected BACKSPACE · press OK"
  else
    m.status.text = "Selected CONNECT · press OK"
  end if
end sub

sub key0Pressed(event)
  if event.getData() = true then appendCode("0")
end sub
sub key1Pressed(event)
  if event.getData() = true then appendCode("1")
end sub
sub key2Pressed(event)
  if event.getData() = true then appendCode("2")
end sub
sub key3Pressed(event)
  if event.getData() = true then appendCode("3")
end sub
sub key4Pressed(event)
  if event.getData() = true then appendCode("4")
end sub
sub key5Pressed(event)
  if event.getData() = true then appendCode("5")
end sub
sub key6Pressed(event)
  if event.getData() = true then appendCode("6")
end sub
sub key7Pressed(event)
  if event.getData() = true then appendCode("7")
end sub
sub key8Pressed(event)
  if event.getData() = true then appendCode("8")
end sub
sub key9Pressed(event)
  if event.getData() = true then appendCode("9")
end sub
sub keyAPressed(event)
  if event.getData() = true then appendCode("A")
end sub
sub keyBPressed(event)
  if event.getData() = true then appendCode("B")
end sub
sub keyCPressed(event)
  if event.getData() = true then appendCode("C")
end sub
sub keyDPressed(event)
  if event.getData() = true then appendCode("D")
end sub
sub keyEPressed(event)
  if event.getData() = true then appendCode("E")
end sub
sub keyFPressed(event)
  if event.getData() = true then appendCode("F")
end sub

sub appendCode(value)
  if m.code <> "" or Len(m.codeBuffer) >= 12 then return
  m.codeBuffer = m.codeBuffer + UCase(value)
  updateCodeDisplay()
  if Len(m.codeBuffer) = 12
    m.connect.visible = true
    m.status.text = "Pairing code ready · press OK to CONNECT"
    focusSelection(18)
  else
    m.status.text = "Entering pairing code · " + Len(m.codeBuffer).ToStr() + " of 12"
  end if
end sub

sub updateCodeDisplay()
  shown = m.codeBuffer
  while Len(shown) < 12
    shown = shown + "·"
  end while
  m.codeDisplay.text = "CODE: " + shown
end sub

sub clearPressed(event)
  if event <> invalid and event.getData() = true and m.code = ""
    clearCodeEntry()
  end if
end sub

sub backspacePressed(event)
  if event <> invalid and event.getData() = true and m.code = ""
    removeLastCodeCharacter()
  end if
end sub

sub connectPressed(event)
  if event <> invalid and event.getData() = true then connectNow()
end sub

sub clearCodeEntry()
  if m.code <> "" then return
  m.codeBuffer = ""
  m.connect.visible = false
  updateCodeDisplay()
  m.status.text = "Code cleared · use the arrows and OK"
  m.focusIndex = 0
end sub

sub removeLastCodeCharacter()
  if m.code <> "" then return
  if Len(m.codeBuffer) > 0
    m.codeBuffer = Left(m.codeBuffer, Len(m.codeBuffer) - 1)
    m.connect.visible = false
    updateCodeDisplay()
    m.status.text = "Removed last character · " + Len(m.codeBuffer).ToStr() + " of 12"
  else
    m.status.text = "Nothing to remove · enter a character first"
  end if
end sub

sub connectNow()
  m.code = UCase(m.codeBuffer)
  if Len(m.code) < 12
    m.status.text = "Enter all 12 characters first."
    return
  end if
  hidePairingScreen()
  m.nowPlaying.visible = true
  m.nowPlaying.text = "CONNECTED · LOADING CH " + m.lastChannel.ToStr()
  m.pendingTune = true
  m.rotation = 0
  request("queue", { channel: m.lastChannel.ToStr(), count: 1, rotation: m.rotation, surface: "roku", sessionId: m.code, freshnessLedger: true })
end sub

sub hidePairingScreen()
  m.overlay.visible = false
  m.brand.visible = false
  m.headline.visible = false
  m.status.visible = false
  m.codeDisplay.visible = false
  m.hint.visible = false
  m.clearCode.visible = false
  m.backspaceCode.visible = false
  m.connect.visible = false
  for each keyId in m.keyIds
    m.top.findNode("key" + keyId).visible = false
  end for
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
  startSessionTimers()
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
  if error <> invalid and error <> ""
    if m.code <> ""
      startSessionTimers()
      m.nowPlaying.visible = true
      m.nowPlaying.text = "RECEIVER WAITING · " + error
    else
      m.status.text = "Receiver waiting · " + error
    end if
  end if
end sub

sub startSessionTimers()
  if m.sessionStarted = true then return
  m.sessionStarted = true
  m.pollTimer.control = "start"
  m.heartbeatTimer.control = "start"
end sub

sub handleCommand(command)
  if command = invalid then return
  action = UCase(command.action)
  if action = "TUNE"
    m.lastChannel = command.channel
    m.rotation = 0
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, rotation: m.rotation, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "NEXT"
    m.lastChannel = m.lastChannel + 1
    m.rotation = 0
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, rotation: m.rotation, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "PREV"
    m.lastChannel = Max(1, m.lastChannel - 1)
    m.rotation = 0
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, rotation: m.rotation, surface: "roku", sessionId: m.code, freshnessLedger: true })
  else if action = "SKIP"
    m.rotation = (m.rotation + 1) mod 4096
    m.pendingTune = true
    request("queue", { channel: m.lastChannel.ToStr(), count: 1, rotation: m.rotation, skip: true, surface: "roku", sessionId: m.code, freshnessLedger: true })
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
    m.nowPlaying.visible = true
    m.nowPlaying.text = "NO PLAYABLE MEDIA RETURNED"
    return
  end if
  streamFormat = "mp4"
  if LCase(mediaUrl).InStr(".m3u8") > 0 then streamFormat = "hls"
  content = CreateObject("roSGNode", "ContentNode")
  content.url = mediaUrl
  content.streamFormat = streamFormat
  m.player.content = content
  m.player.visible = true
  m.player.control = "play"
  m.nowPlaying.visible = true
  title = ""
  if item.DoesExist("title") then title = item.title
  m.nowPlaying.text = "CH " + m.lastChannel.ToStr() + "  ·  " + title
end sub

sub videoState(event)
  if event.getData() = "error"
    m.nowPlaying.visible = true
    m.nowPlaying.text = "SOURCE FAILED · TRY NEXT FROM PHONE"
  end if
end sub
