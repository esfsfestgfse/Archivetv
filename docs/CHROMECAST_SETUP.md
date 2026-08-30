# RealSignal Chromecast setup

RealSignal now includes a Custom Web Receiver and a **CAST** control on desktop
and mobile. The receiver lets the television run the public RealSignal desktop
experience, while the phone or computer remains the remote.

The sender also retries a delayed Cast SDK load automatically and keeps Android's
device picker open for the normal discovery window. The Settings status reports
the browser/platform state and the Cast error code when Google returns one.

## Published receiver

RealSignal's published, unlisted Custom Web Receiver is registered as
`A0A5CD01`. Its receiver URL is:

`https://esfsfestgfse.github.io/Archivetv/realsignal_cast_receiver.html`

Desktop and mobile builds include that receiver ID by default, so normal users
do not need to perform Google developer-console setup or paste an ID.

The Web Sender SDK supports Android Chrome and other Cast-supported web
browsers. Google does not support casting from Chrome on iOS; use Safari if
your iPhone presents Cast support there, or use Android Chrome/desktop Chrome.

## Connect it in RealSignal

Press **CAST**, then choose a Chromecast or Cast-enabled TV on the same Wi-Fi
network. **MENU → SETTINGS → Chromecast Receiver** remains available as a
developer override for testing a different receiver ID.

The receiver restores the active channel and follows later power and channel
changes. A custom override, when supplied, is stored only in the browser's
local RealSignal settings.

## If a mobile device shows no receivers

Open **MENU → SETTINGS** and read the Chromecast status line. RealSignal now
reports whether the browser is unsupported, the page is not HTTPS, the SDK is
still starting, or no devices were discovered. If the app reports that Cast
needs a Chrome tab, the installed Android/PWA window does not expose Chrome's
Web Sender API; open the same HTTPS page in a normal Chrome tab. On Android,
allow local-network access when prompted and verify the phone and Cast device
are on the same Wi-Fi network with access-point isolation disabled.

## Why this is needed

Chrome's own “Cast tab” command cannot be launched programmatically by a web
app. A registered Custom Web Receiver is the supported route for a button in
the app that can hand off the full television interface.
