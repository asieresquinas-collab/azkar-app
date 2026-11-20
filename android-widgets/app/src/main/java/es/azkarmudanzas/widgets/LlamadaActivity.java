package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * v1.41 — LA PANTALLA DE LLAMADA DE AZKARIN (20-nov-2026). Asier: «que me suene como una llamada… la cojo y hablo con él sin
 * tocar el móvil y sin mirar».
 *
 * Solo es la cara: el tono, la voz y el micro los lleva CompaneroService. Sale encima de la pantalla de bloqueo, enciende la
 * pantalla y tiene dos botones grandes. Mientras suena: «Coger» y «Colgar». Ya en la llamada: lo que está pasando («Te escucho…»,
 * «Pensando…») y «Colgar». El botón de los cascos o del manos libres del coche también la coge. Se cierra sola al acabar.
 */
public class LlamadaActivity extends Activity {

    Handler ui = new Handler(Looper.getMainLooper());
    TextView titulo, estado;
    Button coger, colgar;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER_HORIZONTAL);
        raiz.setBackgroundColor(Color.rgb(14, 23, 38));
        int m = dp(28);
        raiz.setPadding(m, dp(90), m, dp(60));

        titulo = new TextView(this);
        titulo.setText("Azkarin");
        titulo.setTextColor(Color.WHITE);
        titulo.setTextSize(40);
        titulo.setGravity(Gravity.CENTER);
        raiz.addView(titulo, new LinearLayout.LayoutParams(-1, -2));

        estado = new TextView(this);
        estado.setText("Te está llamando…");
        estado.setTextColor(Color.rgb(200, 208, 221));
        estado.setTextSize(20);
        estado.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams le = new LinearLayout.LayoutParams(-1, 0, 1f);
        le.topMargin = dp(18);
        raiz.addView(estado, le);

        coger = boton("Coger", Color.rgb(26, 155, 85));
        coger.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { manda(CompaneroService.ACCION_COGER); } });
        raiz.addView(coger, new LinearLayout.LayoutParams(-1, dp(84)));

        colgar = boton("Colgar", Color.rgb(214, 54, 56));
        colgar.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { manda(CompaneroService.ACCION_COLGAR); finish(); } });
        LinearLayout.LayoutParams lc = new LinearLayout.LayoutParams(-1, dp(84));
        lc.topMargin = dp(18);
        raiz.addView(colgar, lc);

        setContentView(raiz);
        ui.post(mira);
    }

    Button boton(String texto, int color) {
        Button x = new Button(this);
        x.setText(texto);
        x.setTextColor(Color.WHITE);
        x.setTextSize(26);
        x.setAllCaps(false);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(42));
        x.setBackground(g);
        return x;
    }
    int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }

    void manda(String accion) {
        try { startService(new Intent(this, CompaneroService.class).setAction(accion)); } catch (Exception e) { /* nada */ }
    }

    /** Cada medio segundo: ¿sigue sonando?, ¿en llamada?, ¿ya ha acabado? */
    final Runnable mira = new Runnable() {
        int sinNada = 0; boolean suelta = false;
        @Override public void run() {
            if (isFinishing()) return;
            if (CompaneroService.sonando) {
                estado.setText("Te está llamando…");
                coger.setVisibility(View.VISIBLE);
                sinNada = 0;
            } else if (CompaneroService.enLlamada) {
                coger.setVisibility(View.GONE);
                // v1.45 · Asier: «que pueda hablar con la pantalla bloqueada, así no gasto tanta batería». Ya cogida, la pantalla
                // deja de sujetarse encendida: se apaga sola o la apagas tú, y la llamada sigue.
                if (!suelta) { suelta = true; getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }
                estado.setText(CompaneroService.ultimoEstado + " · Puedes apagar la pantalla: sigo aquí.");
                sinNada = 0;
            } else if (++sinNada >= 3) { finish(); return; }   // ni suena ni hay llamada: fuera
            ui.postDelayed(this, 500);
        }
    };

    /** El botón de los cascos o del coche: mientras suena, la coge. */
    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if (k == KeyEvent.KEYCODE_HEADSETHOOK || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || k == KeyEvent.KEYCODE_MEDIA_PLAY || k == KeyEvent.KEYCODE_CALL) {
            if (CompaneroService.sonando) { manda(CompaneroService.ACCION_COGER); return true; }
        }
        if (k == KeyEvent.KEYCODE_ENDCALL) { manda(CompaneroService.ACCION_COLGAR); finish(); return true; }
        return super.onKeyDown(k, e);
    }

    @Override public void onBackPressed() { /* no se cierra por error: «Colgar» */ }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
