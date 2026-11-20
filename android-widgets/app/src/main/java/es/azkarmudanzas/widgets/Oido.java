package es.azkarmudanzas.widgets;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;

import java.io.OutputStream;

/**
 * v1.41 — EL OÍDO DE LA LLAMADA (20-nov-2026). Asier: «Azkarin escuchaba su propia voz y se contestaba, era un rollo… y para
 * cortarle tenía que gritarle mucho, no me oía. Arréglalo para que sea fino, como una llamada real».
 *
 * Lo de antes dejaba el micro al reconocedor de Google: oía a Azkarin por el altavoz y solo se enteraba de Asier cuando ya
 * había entendido palabras. Esto hace lo que hace una llamada de teléfono de verdad:
 *   · abre el micro EN MODO LLAMADA (VOICE_COMMUNICATION), que es el que lleva el CANCELADOR DE ECO del móvil: quita del micro
 *     lo que está sonando por el altavoz (la voz de Azkarin), más el quitarruidos y la ganancia automática;
 *   · mide el VOLUMEN de la voz veinte veces por décima de segundo y decide «alguien habla» sin esperar a entender nada:
 *     con un cuarto de segundo de voz normal (no hace falta gritar) avisa, y Azkarin se calla;
 *   · guarda siempre el último segundo, para que al interrumpir no se pierda el principio de la frase;
 *   · y le pasa el sonido ya limpio al reconocedor (por una tubería), que así no oye a Azkarin.
 * El umbral se adapta solo al ruido de fondo (la furgoneta, la calle) y es más exigente mientras Azkarin habla.
 */
class Oido extends Thread {

    interface Escucha { void vozEmpieza(); void vozAcaba(); void fallo(String que); }

    static final int HZ = 16000;
    static final int TRAMA = 320;                 // 20 ms
    static final int PREVIO = HZ * 2;             // 1 segundo en bytes (16 bit)
    final Escucha escucha;
    volatile boolean vivo = true;
    volatile boolean hablandoTts = false;         // Azkarin está hablando: umbral más alto
    volatile long ttsDesde = 0;                   // cuándo empezó a hablar (medio segundo de gracia)
    volatile float suelo = 40f, ultimoDb = 0f;    // para el chivato
    volatile boolean conEco = false, conRuido = false;
    private OutputStream salida;                  // la tubería al reconocedor (o null)
    private final byte[] previo = new byte[PREVIO];
    private int pPrevio = 0; private boolean previoLleno = false;
    private boolean enVoz = false;
    private int tramasVoz = 0, tramasSilencio = 0;

    Oido(Escucha e) { super("azkar-oido"); escucha = e; setDaemon(true); }

    /** Conectar (o soltar) la tubería del reconocedor. Con «conPrevio», primero va el último segundo (lo que dijo al interrumpir). */
    synchronized void conectar(OutputStream o, boolean conPrevio) {
        cerrarSalida();
        salida = o;
        if (o != null && conPrevio) {
            try {
                if (previoLleno) o.write(previo, pPrevio, PREVIO - pPrevio);
                o.write(previo, 0, pPrevio);
            } catch (Exception e) { cerrarSalida(); }
        }
    }
    synchronized void cerrarSalida() {
        if (salida != null) { try { salida.close(); } catch (Exception e) { /* nada */ } salida = null; }
    }
    synchronized boolean conectado() { return salida != null; }
    /** Empezar de cero la cuenta de voz (al abrir una escucha nueva). */
    void reinicia() { enVoz = false; tramasVoz = 0; tramasSilencio = 0; }
    void parar() { vivo = false; interrupt(); }

    @Override
    public void run() {
        AudioRecord ar = null;
        AcousticEchoCanceler aec = null; NoiseSuppressor ns = null; AutomaticGainControl agc = null;
        try {
            int min = AudioRecord.getMinBufferSize(HZ, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            ar = new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, HZ, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, TRAMA * 2 * 10));
            if (ar.getState() != AudioRecord.STATE_INITIALIZED) { escucha.fallo("el micro en modo llamada no abre"); return; }
            int sesion = ar.getAudioSessionId();
            try { if (AcousticEchoCanceler.isAvailable()) { aec = AcousticEchoCanceler.create(sesion); if (aec != null) { aec.setEnabled(true); conEco = aec.getEnabled(); } } } catch (Exception e) { /* sin él, queda el del modo llamada */ }
            try { if (NoiseSuppressor.isAvailable()) { ns = NoiseSuppressor.create(sesion); if (ns != null) { ns.setEnabled(true); conRuido = ns.getEnabled(); } } } catch (Exception e) { /* nada */ }
            try { if (AutomaticGainControl.isAvailable()) { agc = AutomaticGainControl.create(sesion); if (agc != null) agc.setEnabled(true); } } catch (Exception e) { /* nada */ }
            ar.startRecording();
            short[] t = new short[TRAMA];
            byte[] b = new byte[TRAMA * 2];
            while (vivo) {
                int n = ar.read(t, 0, TRAMA);
                if (n <= 0) { if (n < 0) { escucha.fallo("el micro se ha cortado (" + n + ")"); return; } continue; }
                double suma = 0;
                for (int i = 0; i < n; i++) { short s = t[i]; suma += (double) s * s; b[2 * i] = (byte) (s & 0xff); b[2 * i + 1] = (byte) ((s >> 8) & 0xff); }
                float db = (float) (10.0 * Math.log10(suma / n + 1.0));
                ultimoDb = db;
                // el último segundo, siempre
                for (int i = 0; i < n * 2; i++) { previo[pPrevio++] = b[i]; if (pPrevio >= PREVIO) { pPrevio = 0; previoLleno = true; } }
                // al reconocedor, si hay tubería
                synchronized (this) { if (salida != null) { try { salida.write(b, 0, n * 2); } catch (Exception e) { cerrarSalida(); } } }
                // ¿alguien habla?
                boolean gracia = hablandoTts && System.currentTimeMillis() - ttsDesde < 500;
                float umbral = Math.max(suelo + (hablandoTts ? 13f : 9f), hablandoTts ? 46f : 42f);
                boolean voz = db > umbral && !gracia;
                if (!voz) { if (db < suelo) suelo = db; else suelo += (hablandoTts ? 0.01f : 0.03f); if (suelo < 25f) suelo = 25f; if (suelo > 65f) suelo = 65f; }
                if (voz) { tramasVoz++; tramasSilencio = 0; } else { tramasSilencio++; if (tramasVoz > 0 && tramasSilencio > 6) tramasVoz = 0; }
                if (!enVoz && tramasVoz >= (hablandoTts ? 12 : 6)) { enVoz = true; try { escucha.vozEmpieza(); } catch (Exception e) { /* nada */ } }
                else if (enVoz && tramasSilencio >= 45) { enVoz = false; tramasVoz = 0; try { escucha.vozAcaba(); } catch (Exception e) { /* nada */ } }   // 0,9 s callado
            }
        } catch (Exception e) {
            if (vivo) escucha.fallo(String.valueOf(e.getMessage()));
        } finally {
            cerrarSalida();
            try { if (aec != null) aec.release(); } catch (Exception e) { /* nada */ }
            try { if (ns != null) ns.release(); } catch (Exception e) { /* nada */ }
            try { if (agc != null) agc.release(); } catch (Exception e) { /* nada */ }
            try { if (ar != null) { ar.stop(); ar.release(); } } catch (Exception e) { /* nada */ }
        }
    }
}
