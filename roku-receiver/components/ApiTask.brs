sub init()
  m.top.functionName = "run"
end sub

sub run()
  m.top.error = ""
  kind = LCase(m.top.requestKind)
  api = m.top.baseUrl
  if kind = "session-get"
    url = api + "/roku/session?code=" + EncodeUriComponent(m.top.code) + "&since=" + StrI(m.top.since).Trim()
    body = invalid
    method = "GET"
  else if kind = "heartbeat"
    url = api + "/roku/session"
    body = { action: "heartbeat", code: m.top.code, model: "RealSignal Roku Preview" }
    method = "POST"
  else if kind = "queue"
    url = api + "/ia/queue"
    body = m.top.payload
    method = "POST"
  else
    m.top.error = "unsupported request"
    return
  end if

  port = CreateObject("roMessagePort")
  transfer = CreateObject("roUrlTransfer")
  transfer.SetPort(port)
  transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
  transfer.InitClientCertificates()
  transfer.SetUrl(url)
  transfer.AddHeader("Accept", "application/json")
  transfer.AddHeader("X-RealSignal-Client", "roku-preview")
  if method = "POST"
    transfer.AddHeader("Content-Type", "application/json")
    started = transfer.AsyncPostFromString(FormatJson(body))
  else
    started = transfer.AsyncGetToString()
  end if
  if not started
    m.top.error = "request did not start"
    return
  end if
  event = wait(9000, port)
  if type(event) <> "roUrlEvent"
    m.top.error = "request timed out"
    return
  end if
  if event.GetResponseCode() < 200 or event.GetResponseCode() >= 300
    m.top.error = "HTTP " + event.GetResponseCode().ToStr()
    return
  end if
  parsed = ParseJson(event.GetString())
  if parsed = invalid
    m.top.error = "invalid server response"
    return
  end if
  m.top.result = parsed
end sub
