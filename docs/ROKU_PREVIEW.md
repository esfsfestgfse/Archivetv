# RealSignal Roku preview

This is an opt-in Roku prototype. It does not replace or modify the existing
desktop, mobile, Chromecast sender, or Chromecast receiver paths.

## What it does

The preview uses a small session bridge:

`phone/browser remote → RealSignal API session → Roku receiver → Roku Video node`

The remote sends channel and transport commands to one short-lived Durable
Object session. The Roku receiver polls that session, asks the existing API for
one verified queue item, and plays a direct media URL when the source is Roku-
compatible.

Supported command path: power, tune, previous/next, play, pause, stop, mute,
volume, guide, and back. The guide remains on the phone remote in this first
preview so the existing guide is not duplicated or changed.

## Try the remote

After the Pages workflow publishes it, open `/roku_remote.html` on a phone or
desktop. Select **New session**, then enter the same pairing code in the native
Roku preview app. The remote will show when the receiver is online.

## Important limits

- A physical Roku device is required to certify actual discovery, decoding, and
  long-play behavior.
- The Roku receiver can play direct MP4/HLS URLs returned by the API. A YouTube
  page/embed URL is not automatically a Roku media stream and is rejected by the
  receiver rather than pretending it will work.
- The native folder is a sideloadable prototype, not an official Roku Channel
  Store package. It must be packaged and sideloaded in Roku developer mode for
  device testing.
- Session state expires after 12 hours and keeps only the latest 32 commands.

## Safety boundary

The default RealSignal app still uses its existing web and Chromecast paths.
Nothing in this preview is called by the normal channel player unless the Roku
remote is explicitly opened and a Roku session is created.
