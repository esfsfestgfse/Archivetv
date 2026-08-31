package com.realsignal.sender;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.mediarouter.app.MediaRouteButton;

import com.google.android.gms.cast.framework.CastButtonFactory;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;

import org.json.JSONException;
import org.json.JSONObject;

/** Native RealSignal remote with Android-owned Cast discovery. */
public final class MainActivity extends AppCompatActivity {
    public static final String CUSTOM_NAMESPACE = "urn:x-cast:com.realsignal.dial";
    private static final int DISCOVERY_PERMISSION_REQUEST = 2401;
    private static final int MIN_CHANNEL = 1;
    private static final int MAX_CHANNEL = 999;

    private CastContext castContext;
    private SessionManager sessionManager;
    private EditText channelInput;
    private SwitchCompat powerToggle;
    private TextView statusText;

    private final SessionManagerListener<CastSession> sessionListener = new SessionManagerListener<CastSession>() {
        @Override
        public void onSessionStarting(@NonNull CastSession session) {
            setStatus("Connecting to Cast receiver...");
        }

        @Override
        public void onSessionStarted(@NonNull CastSession session, String sessionId) {
            setStatus("Connected · RealSignal receiver ready");
            sendState();
        }

        @Override
        public void onSessionStartFailed(@NonNull CastSession session, int error) {
            setStatus("Cast connection failed · code " + error);
        }

        @Override
        public void onSessionEnding(@NonNull CastSession session) {
            setStatus("Disconnecting...");
        }

        @Override
        public void onSessionEnded(@NonNull CastSession session, int error) {
            setStatus("Not connected · tap the Cast icon to choose a device");
        }

        @Override
        public void onSessionResuming(@NonNull CastSession session, String sessionId) {
            setStatus("Reconnecting to Cast receiver...");
        }

        @Override
        public void onSessionResumed(@NonNull CastSession session, boolean wasSuspended) {
            setStatus("Connected · RealSignal receiver ready");
            sendState();
        }

        @Override
        public void onSessionResumeFailed(@NonNull CastSession session, int error) {
            setStatus("Cast resume failed · code " + error);
        }

        @Override
        public void onSessionSuspended(@NonNull CastSession session, int reason) {
            setStatus("Cast session paused · code " + reason);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        channelInput = findViewById(R.id.channel_input);
        powerToggle = findViewById(R.id.power_toggle);
        statusText = findViewById(R.id.cast_status);
        MediaRouteButton castButton = findViewById(R.id.cast_button);

        CastButtonFactory.setUpMediaRouteButton(getApplicationContext(), castButton);
        castContext = CastContext.getSharedInstance(this);
        sessionManager = castContext.getSessionManager();
        sessionManager.addSessionManagerListener(sessionListener, CastSession.class);

        Button sendButton = findViewById(R.id.send_state_button);
        Button channelDown = findViewById(R.id.channel_down_button);
        Button channelUp = findViewById(R.id.channel_up_button);
        Button openWeb = findViewById(R.id.open_web_button);

        sendButton.setOnClickListener(view -> sendState());
        powerToggle.setOnCheckedChangeListener((button, checked) -> sendState());
        channelDown.setOnClickListener(view -> sendCommand("CHANNEL_DOWN"));
        channelUp.setOnClickListener(view -> sendCommand("CHANNEL_UP"));
        bindCommand(R.id.guide_button, "GUIDE");
        bindCommand(R.id.menu_button, "MENU");
        bindCommand(R.id.next_button, "NEXT");
        bindCommand(R.id.surf_button, "SURF");
        bindCommand(R.id.last_button, "LAST");
        bindCommand(R.id.mute_button, "MUTE");
        bindCommand(R.id.volume_down_button, "VOLUME_DOWN");
        bindCommand(R.id.volume_up_button, "VOLUME_UP");
        bindCommand(R.id.back_button, "BACK");
        openWeb.setOnClickListener(view -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.web_app_url)))));

        setStatus("Ready · tap the Cast icon to search your local network");
        requestDiscoveryPermissionIfNeeded();
    }

    /** Android 13+ gates nearby Wi-Fi discovery behind a runtime permission. */
    private void requestDiscoveryPermissionIfNeeded() {
        String permission = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permission = Manifest.permission.NEARBY_WIFI_DEVICES;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            permission = Manifest.permission.ACCESS_FINE_LOCATION;
        }
        if (permission == null || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        requestPermissions(new String[]{permission}, DISCOVERY_PERMISSION_REQUEST);
        setStatus("Allow Nearby devices so Android can discover Cast receivers");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != DISCOVERY_PERMISSION_REQUEST) {
            return;
        }
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            setStatus("Nearby devices allowed · tap the Cast icon to search again");
        } else {
            setStatus("Nearby devices denied · Cast discovery may show no devices");
        }
    }

    private void bindCommand(int viewId, String action) {
        Button button = findViewById(viewId);
        button.setOnClickListener(view -> sendCommand(action));
    }

    private int readChannel() {
        try {
            int channel = Integer.parseInt(channelInput.getText().toString().trim());
            return Math.max(MIN_CHANNEL, Math.min(MAX_CHANNEL, channel));
        } catch (NumberFormatException ignored) {
            channelInput.setText(String.valueOf(MIN_CHANNEL));
            return MIN_CHANNEL;
        }
    }

    private void sendState() {
        if (sessionManager == null) {
            setStatus("Cast framework is not ready");
            return;
        }
        CastSession session = sessionManager.getCurrentCastSession();
        if (session == null || !session.isConnected()) {
            setStatus("No Cast session · tap the Cast icon and choose a device first");
            return;
        }

        try {
            JSONObject state = new JSONObject();
            state.put("type", "REALSIGNAL_STATE");
            state.put("appUrl", getString(R.string.web_app_url));
            state.put("channel", readChannel());
            state.put("powered", powerToggle.isChecked());
            state.put("muted", false);
            state.put("volume", 0.5);
            state.put("texture", "1");
            state.put("sentAt", System.currentTimeMillis());
            session.sendMessage(CUSTOM_NAMESPACE, state.toString());
            setStatus("State sent · channel " + readChannel() + (powerToggle.isChecked() ? " · on" : " · off"));
        } catch (JSONException error) {
            setStatus("Could not create Cast state packet");
        }
    }

    private void sendCommand(String action) {
        if (sessionManager == null) {
            setStatus("Cast framework is not ready");
            return;
        }
        CastSession session = sessionManager.getCurrentCastSession();
        if (session == null || !session.isConnected()) {
            setStatus("No Cast session · choose a device first");
            return;
        }
        try {
            JSONObject command = new JSONObject();
            command.put("type", "REALSIGNAL_COMMAND");
            command.put("action", action);
            command.put("sentAt", System.currentTimeMillis());
            session.sendMessage(CUSTOM_NAMESPACE, command.toString());
            setStatus("Sent · " + action.replace('_', ' '));
        } catch (JSONException error) {
            setStatus("Could not create Cast command");
        }
    }

    private void setStatus(String message) {
        if (statusText != null) {
            statusText.setText(message);
        }
    }

    @Override
    protected void onDestroy() {
        if (sessionManager != null) {
            sessionManager.removeSessionManagerListener(sessionListener, CastSession.class);
        }
        super.onDestroy();
    }
}
