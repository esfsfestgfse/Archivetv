# RealSignal Chromecast setup

RealSignal now includes a Custom Web Receiver and a **CAST** control on desktop
and mobile. The receiver lets the television run the public RealSignal desktop
experience, while the phone or computer remains the remote.

## Published receiver

RealSignal's published, unlisted Custom Web Receiver is registered as
`A0A5CD01`. Its receiver URL is:

`https://esfsfestgfse.github.io/Archivetv/realsignal_cast_receiver.html`

Desktop and mobile builds include that receiver ID by default, so normal users
do not need to perform Google developer-console setup or paste an ID.

## Connect it in RealSignal

Press **CAST**, then choose a Chromecast or Cast-enabled TV on the same Wi-Fi
network. **MENU → SETTINGS → Chromecast Receiver** remains available as a
developer override for testing a different receiver ID.

The receiver restores the active channel and follows later power and channel
changes. A custom override, when supplied, is stored only in the browser's
local RealSignal settings.

## Why this is needed

Chrome's own “Cast tab” command cannot be launched programmatically by a web
app. A registered Custom Web Receiver is the supported route for a button in
the app that can hand off the full television interface.
