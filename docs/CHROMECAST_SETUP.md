# RealSignal Chromecast setup

RealSignal now includes a Custom Web Receiver and a **CAST** control on desktop
and mobile. The receiver lets the television run the public RealSignal desktop
experience, while the phone or computer remains the remote.

## One-time Google registration

1. Open the [Google Cast SDK Developer Console](https://cast.google.com/publish/)
   with the Google account that owns the receiver registration.
2. Register a **Custom Web Receiver**.
3. Set its receiver URL to:

   `https://esfsfestgfse.github.io/Archivetv/realsignal_cast_receiver.html`

4. Copy the receiver application ID that Google gives you.

## Connect it in RealSignal

Open **MENU → SETTINGS**, paste that ID in **Chromecast Receiver**, press
**SAVE**, then press **CAST**. Choose a Chromecast or Cast-enabled TV on the
same Wi-Fi network.

The receiver restores the active channel and follows later power and channel
changes. The ID is stored only in the browser's local RealSignal settings.

## Why this is needed

Chrome's own “Cast tab” command cannot be launched programmatically by a web
app. A registered Custom Web Receiver is the supported route for a button in
the app that can hand off the full television interface.
