# Shared broadcast pilot rollout

Start with Classic Reruns (10), Classic Game Shows (12), and Classic Cartoons (150) on the separate pilot page. The pilot clock determines both the picture and the program guide. Next lets a viewer watch ahead without changing the live clock for anyone else.

## Start the preview

Run `node scripts/serve-broadcast-pilot.mjs` from the repository root and open `http://127.0.0.1:4194/broadcast_preview.html`. Set `REALSIGNAL_BROADCAST_PORT` if that port is in use. The server starts a refresh immediately and repeats it every 15 minutes. An open guide reads new schedules once a minute. Viewer requests only read the published schedule.

The hosted canary uses the `broadcast-canary` branch. GitHub Actions restores the last deployed catalog and rotation, refreshes all three channels, and publishes the preview files to the separate `realsignal-broadcast-canary` Worker. The first run starts from the captured pilot checkpoint. Later runs restore the checkpoint from the last successful deployment. The workflow runs hourly once it is present on the default branch.

## Check before widening access

- Run `node --test scripts/test-broadcast-schedule.mjs scripts/test-broadcast-player.mjs`.
- Check two refresh logs for new files, rechecked files, catalog hours, and distinct programs. Inspect the show mix as well as the episode count. A lane marked `HELD` continues serving its last usable schedule and needs investigation before promotion.
- On two browser sessions, tune the same channel and compare the current and next titles. Leave one tuned across a refresh and the other across a commercial. Check Next and Back to Live on the desktop and phone.
- Watch the schedule advance through an Archive verification expiry and a publisher restart. Preserve the existing state directory on restart so the same episodes do not start a new rotation.

Pause the GitHub workflow to stop publication. Keep its latest checkpoint so testing can resume from the same catalog and rotation history.
