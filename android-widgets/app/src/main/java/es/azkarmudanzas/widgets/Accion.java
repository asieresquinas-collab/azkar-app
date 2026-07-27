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
 * El DESTINO lo decide el servidor, EN CÓDIGO (repaso-lunes.js → _accionDe, y equipo.js →
 * hoyEquipoJson), nunca el modelo. Aquí solo se lee lo que mandó y se comprueba otra vez
 * antes de pintar nada:
 *
 *   REGLA DURA — un botón de llamar solo se pinta si trae un teléfono de verdad.
 *   Si algún día el servidor mandara un "llamar" sin número, esa raya se queda SIN
 *   botón (se abre la app y ya). Preferimos quedarnos cortos a que Asier toque
 *   "llamar" y no llame a nadie, o peor, llame a quien no era.
 *
 * v1.16 — el panel grande de la tablet añade 📍 mapa, 📄 parte y 📋 plan entero, y trae
 * además CÓMO SE PINTA cada raya (`estilo`), para que las direcciones salgan EN GRANDE.
 */
public class Accion {

    /** v1.16 · tipos del panel del equipo: mapa (📍), parte (📄), portal (📋), nada. */
    String tipo = "app";      // llamar | correo | ficha | mapa | parte | portal | nada | repaso | app
    String uri = "";
    String etiqueta = "";
    /** v1.16 · CÓMO SE PINTA esa raya. Lo decide el SERVIDOR, en código, y viaja DENTRO de
     *  la misma casilla que el botón: así el texto, el botón y el tamaño de una raya no
     *  pueden descolocarse entre sí nunca (que es justo el fallo que mandaría a un chico a
     *  la dirección de otro cliente). Vale: dia | direccion | titulo | aviso | normal. */
    String estilo = "normal";

    static Accion de(JSONObject j) {
        Accion a = new Accion();
        if (j == null) return a;
        a.tipo = j.optString("tipo", "app");
        a.uri = absoluta(j.optString("uri", ""));
        a.etiqueta = j.optString("etiqueta", "");
        a.estilo = j.optString("estilo", "normal");
        return a;
    }

    /** v1.16 · el portal manda sus enlaces empezando por "/api/equipo/…" (sin el servidor
     *  delante). Aquí se les pone el servidor UNA sola vez, al leerlos, para que de ahí en
     *  adelante todo el mundo trabaje con direcciones enteras. */
    static String absoluta(String u) {
        String s = String.valueOf(u == null ? "" : u).trim();
        if (s.startsWith("/")) return Datos.BASE + s;
        return s;
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
     *  llamar, escribir un correo, abrir la ficha, el mapa, el parte o el plan entero.
     *  Los avisos (⚠️, 🎉, "… y N más" sin destino) no llevan botón: la raya entera
     *  abre lo que toca y punto. */
    boolean tieneBoton() {
        if (uri == null || uri.isEmpty()) return false;
        if ("llamar".equals(tipo)) return uri.startsWith("tel:") && AccionActivity.soloNumero(uri).length() >= 3;
        if ("correo".equals(tipo)) return uri.startsWith("mailto:") && uri.indexOf('@') > "mailto:".length();
        if ("ficha".equals(tipo)) return uri.startsWith("https://");
        // v1.16 · panel del equipo. Se exige https:// DE VERDAD: si el servidor mandara una
        // dirección a medias, mejor raya sin botón que un botón que abra cualquier cosa.
        if ("mapa".equals(tipo)) return uri.startsWith("https://") && uri.length() > "https://maps.google.com/?q=".length();
        if ("parte".equals(tipo)) return uri.startsWith("https://") && uri.contains("/api/equipo/");
        if ("portal".equals(tipo)) return uri.startsWith("https://") && uri.contains("/api/equipo/");
        return false;
    }

    /** El dibujito del botón: se entiende de un vistazo sin leer nada. */
    String icono() {
        if ("llamar".equals(tipo)) return "📞";
        if ("correo".equals(tipo)) return "✉️";
        if ("ficha".equals(tipo)) return "📄";
        if ("mapa".equals(tipo)) return "📍";
        if ("parte".equals(tipo)) return "📄";
        if ("portal".equals(tipo)) return "📋";
        return "";
    }

    /** Lo que se lee en voz alta (accesibilidad) y lo que dice el avisito al tocarlo. */
    String queHace() {
        if (etiqueta != null && !etiqueta.isEmpty()) return etiqueta;
        if ("llamar".equals(tipo)) return "Llamar al " + AccionActivity.soloNumero(uri);
        if ("correo".equals(tipo)) return "Escribir el correo";
        if ("ficha".equals(tipo)) return "Abrir la ficha";
        if ("mapa".equals(tipo)) return "Ver en el mapa";
        if ("parte".equals(tipo)) return "Abrir el parte de trabajo";
        if ("portal".equals(tipo)) return "Abrir el plan de trabajo";
        return "Abrir Azkar";
    }

    // ── v1.16 · CÓMO SE PINTA LA RAYA ──────────────────────────────────────────────
    // Asier lo pidió con estas palabras: «para que lo vean bien claro DÓNDE ESTÁ».
    // Por eso las direcciones salen a 20sp: son lo que un chico busca de un vistazo
    // desde la furgoneta, no el texto que se lee con calma.

    /** El tamaño de letra de esa raya, en sp. */
    float tamano() {
        if ("dia".equals(estilo)) return 20f;
        if ("direccion".equals(estilo)) return 20f;
        if ("titulo".equals(estilo)) return 17f;
        return 16f;   // el mismo del layout: una raya normal no cambia de tamaño al repintarse
    }

    /** El color de esa raya. */
    int color() {
        if ("dia".equals(estilo)) return 0xFF1B4F8A;        // azul Azkar: el día
        if ("direccion".equals(estilo)) return 0xFF0B3D6B;  // azul oscuro: a dónde hay que ir
        if ("aviso".equals(estilo)) return 0xFFB23B00;      // naranja quemado: KONTUZ
        return 0xFF111111;
    }

    /** ¿En negrita? El día, la dirección, el título del servicio y los avisos, sí. */
    boolean negrita() {
        return "dia".equals(estilo) || "direccion".equals(estilo)
                || "titulo".equals(estilo) || "aviso".equals(estilo);
    }
}
