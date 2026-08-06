package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * v1.17 · DÓNDE ESTÁ ASIER, para que Azkarin pueda decirle CUÁNTO TARDA.
 *
 * Asier: «no me sale para activar la ubicación en la APK». Y era verdad: el
 * walkie-talkie hablaba con Azkarin sin decirle nunca desde dónde. Aquí se coge la
 * posición del móvil MIENTRAS la tarjeta está abierta (y solo mientras: al cerrarla se
 * suelta el GPS, ni gasta batería ni sigue a nadie por ahí) y se manda con cada frase.
 *
 * Se usa el LocationManager de siempre (no hace falta Google Play Services): se escucha
 * a la RED y al GPS a la vez y se queda con la lectura más nueva — en interiores la red
 * contesta en segundos y el GPS puede no contestar nunca.
 *
 * REGLA: una posición vieja NO vale. Si tiene más de 5 minutos no se manda, porque
 * calcular la ruta desde donde YA NO ESTÁ es peor que no calcularla.
 */
class Ubic {

    static final long CADUCA_MS = 5 * 60 * 1000L;

    private static volatile Location ultima = null;
    private static volatile String motivo = null;   // denegado | sin_senal | null
    private static LocationManager lm = null;
    private static LocationListener oyente = null;

    /** ¿Tenemos el permiso concedido? */
    static boolean hayPermiso(Context ctx) {
        try {
            return ctx.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ctx.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) { return false; }
    }

    /** Empieza a escuchar la posición. Se llama al abrir la tarjeta del walkie-talkie. */
    static void arranca(Activity a) {
        if (!hayPermiso(a)) { motivo = "denegado"; return; }
        try {
            lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) { motivo = "sin_senal"; return; }

            // Lo último que tenga el móvil ya guardado: si es reciente, vale desde el primer segundo.
            Location mejor = null;
            for (String p : new String[]{LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER}) {
                try {
                    Location l = lm.getLastKnownLocation(p);
                    if (esMejor(l, mejor)) mejor = l;
                } catch (Exception e) { /* ese proveedor no está: seguimos */ }
            }
            if (mejor != null && (System.currentTimeMillis() - mejor.getTime()) < CADUCA_MS) ultima = mejor;

            oyente = new LocationListener() {
                @Override public void onLocationChanged(Location l) { if (esMejor(l, ultima)) { ultima = l; motivo = null; } }
                @Override public void onStatusChanged(String p, int s, Bundle e) { }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
            };
            boolean alguno = false;
            for (String p : new String[]{LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER}) {
                try {
                    if (!lm.isProviderEnabled(p)) continue;
                    lm.requestLocationUpdates(p, 2000L, 5f, oyente);
                    alguno = true;
                } catch (Exception e) { /* ese proveedor no se puede: probamos el otro */ }
            }
            if (!alguno && ultima == null) motivo = "sin_senal";
        } catch (Exception e) { motivo = "sin_senal"; }
    }

    /** Suelta el GPS. Al cerrar la tarjeta: aquí NO se sigue a nadie en segundo plano. */
    static void para(Activity a) {
        try { if (lm != null && oyente != null) lm.removeUpdates(oyente); } catch (Exception e) { /* da igual */ }
        oyente = null;
        lm = null;
    }

    /** ¿Es `l` mejor que `ref`? Más nueva manda; a igualdad de momento, la más precisa. */
    private static boolean esMejor(Location l, Location ref) {
        if (l == null) return false;
        if (ref == null) return true;
        long dt = l.getTime() - ref.getTime();
        if (dt > 30000L) return true;      // media hora... no: medio minuto más nueva ya manda
        if (dt < -30000L) return false;
        return l.getAccuracy() <= ref.getAccuracy();
    }

    /** La posición para mandar a Azkarin, o null si no hay o está caducada. */
    static JSONObject json() {
        Location l = ultima;
        if (l == null) return null;
        if ((System.currentTimeMillis() - l.getTime()) > CADUCA_MS) return null;  // vieja = no vale
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lon", l.getLongitude());
            if (l.hasAccuracy()) o.put("precision", Math.round(l.getAccuracy()));
            o.put("ts", l.getTime());
            return o;
        } catch (Exception e) { return null; }
    }

    /** Si no hay posición: POR QUÉ (para que Azkarin lo diga en cristiano). */
    static String motivo() {
        if (json() != null) return null;
        if (motivo != null) return motivo;
        return "sin_senal";
    }
}
