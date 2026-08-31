package com.realsignal.sender;

import android.content.Context;

import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionProvider;

import java.util.List;

/** Supplies the published RealSignal Custom Web Receiver to the Cast framework. */
public final class CastOptionsProvider implements OptionsProvider {
    @Override
    public CastOptions getCastOptions(Context context) {
        return new CastOptions.Builder()
                .setReceiverApplicationId(context.getString(R.string.cast_app_id))
                .build();
    }

    @Override
    public List<SessionProvider> getAdditionalSessionProviders(Context context) {
        return null;
    }
}
