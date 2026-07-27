package es.azkarmudanzas.widgets;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * v1.15 — LO QUE HAY DETRÁS DEL BOTÓN DE CADA RAYA.
 *
 * Lo pidió Asier: «cada cosa un botón para llegar a donde tiene que llegar… pone llamar
 * a este número que no ha llamado, pues un botón para llamar a ese número… y luego los
 * otros, pues cada uno en su sitio».
 *
 * El DESTINO lo decide el servidor, EN CÓDIGO (repaso-lunes.js → _accionDe), nunca el
 * modelo. Aquí solo se lee lo que mandó y se comprueba otra vez antes de pintar nada:
 *
 *   REGLA DURA — un botón de llamar solo se pinta si trae un teléfono de verdad.
 *   Si algún día el servidor mandara un "llamar" sin número, esa raya se queda SIN
 *   botón (se abre la app y ya). Preferimos quedarnos cortos a que Asier toque
 *   "llamar" y no llame a nadie, o peor, llame a quien no era.
 */
public class Accion {

    String tipo = "app";      // llamar | correo | ficha | repaso | app
    String uri = "";
    String etiqueta = "";

    static Accion de(JSONObject j) {
        Accion a = new Accion();
        if (j == null) return a;
        a.tipo = j.optString("tipo", "app");
        a.uri = j.optString("uri", "");
        a.etiqueta = j.optString("etiqueta", "");
        return a;
    }

    /** Las acciones tal y como vienen guardadas (texto JSON). Nunca revienta: si algo
     *  viniera raro, se devuelve vacío y el widget se queda sin botones, que es lo seguro. */
    static Accion[] deTexto(String s) {
        try {
            JSONArray arr = new JSONArray(s == null || s.isEmpty() ? "[]" : s);
            Accion[] out = new Accion[arr.length()];
            for (int i = 0; i < arr.length(); i++) out[i] = de(arr.optJSONObject(i));
            return out;
        } catch (Exception e) {
            return new Accion[0];
        }
    }

    /** ¿Esta cosa merece botón propio? Solo si lleva a un sitio DISTINTO de la app:
     *  llamar, escribir un correo o abrir la ficha. Los avisos (⚠️, 🎉, "… y N más")
     *  no llevan botón: la raya entera abre la app y punto. */
    boolean tieneBoton() {
        if (uri == null || uri.isEmpty()) return false;
        if ("llamar".equals(tipo)) return uri.startsWith("tel:") && AccionActivity.soloNumero(uri).length() >= 3;
        if ("correo".equals(tipo)) return uri.startsWith("mailto:") && uri.indexOf('@') > "mailto:".length();
        if ("ficha".equals(tipo)) return uri.startsWith("https://");
        return false;
    }

    /** El dibujito del botón: se entiende de un vistazo sin leer nada. */
    String icono() {
        if ("llamar".equals(tipo)) return "📞";
        if ("correo".equals(tipo)) return "✉️";
        if ("ficha".equals(tipo)) return "📄";
        return "";
    }

    /** Lo que se lee en voz alta (accesibilidad) y lo que dice el avisito al tocarlo. */
    String queHace() {
        if (etiqueta != null && !etiqueta.isEmpty()) return etiqueta;
        if ("llamar".equals(tipo)) return "Llamar al " + AccionActivity.soloNumero(uri);
        if ("correo".equals(tipo)) return "Escribir el correo";
        if ("ficha".equals(tipo)) return "Abrir la ficha";
        return "Abrir Azkar";
    }
}
