# Gestoría automática

Aplicación web para una asesoría fiscal y contable (autónomos y pymes). Hace sola la parte repetitiva del trabajo y deja a los gestores lo que necesita criterio.

## Qué hace sola

| Área | Automático | Lo que sigue haciendo una persona |
|---|---|---|
| Recogida de documentos | El cliente sube PDF o fotos desde su portal. La IA lee cada factura, comprueba NIF, fechas, que los importes cuadren y que no esté duplicada, y si todo es correcto la contabiliza con su cuenta del PGC. Tras cerrar el trimestre reclama la documentación a quien no ha subido nada. | Revisar los documentos dudosos en una pantalla con el documento a un lado y los datos al otro, con el motivo exacto de la duda. |
| Impuestos y plazos | Calendario por cliente según sus obligaciones (303, 130, 111/110, 115, 390, 190, 180, 347, 100, 200, 202). Borradores de 303, 130, 111, 115, 390 y 347 recalculados con cada factura. Aviso al gestor 10 días antes de cada vencimiento. | Revisar el borrador y presentar el modelo en la sede de Hacienda. La aplicación **no presenta** impuestos. |
| Atención al cliente | Asistente en el portal que contesta con los datos del expediente (plazos, qué falta, estado). Borradores de correos para el gestor. | Las consultas que requieren criterio profesional: el asistente las deriva y crea la tarea. |
| Gestión interna | Tareas creadas y cerradas solas, recibos mensuales de honorarios, registro de correos, exportación de libros a CSV. | Tareas manuales y cobro. |

El panel muestra el porcentaje de trabajo hecho sin intervención, **medido** sobre la actividad real de los últimos 90 días (no es una cifra fija ni garantizada: depende de la calidad de los documentos que suban los clientes).

## Puesta en marcha

Necesita Node.js 22.5 o superior.

```bash
npm install
cp .env.example .env      # y rellenar las claves
npm start                  # http://localhost:3000
```

La primera vez pide crear la cuenta del administrador. Para enseñarla con datos de ejemplo, sobre una instalación vacía:

```bash
npm run demo               # crea clientes, facturas y usuarios de muestra e imprime las contraseñas
npm start
```

Variables (ver `.env.example`): `ANTHROPIC_API_KEY` activa la lectura de facturas, el asistente y la redacción de correos; sin ella todo funciona en modo manual. `RESEND_API_KEY` y `CORREO_REMITENTE` activan el envío de correos; sin ellas los avisos solo se ven en el portal. `DIR_DATOS` es la carpeta de la base de datos (SQLite) y de los archivos: en un alojamiento como Railway tiene que apuntar a un volumen persistente. Servir siempre por HTTPS.

## Pruebas

```bash
npm test
```

Cubren el motor fiscal (NIF, calendario, 303, 130, 111, 115, 347) y el flujo completo contra el servidor con la IA simulada (permisos, subida, contabilización automática, revisión, asistente, reclamaciones y avisos).

## Límites que conviene conocer antes de venderla

- Los importes son borradores de trabajo. Cada asesoría debe validarlos contra su programa contable durante un trimestre antes de fiarse.
- Plazos de territorio común por defecto; en Ajustes se cambian los días límite y se activa el modelo 110 de Bizkaia. No conoce festivos locales ni particularidades forales (TicketBAI/Batuz, modelo 140).
- No trata nóminas, recargo de equivalencia, módulos, prorrata ni operaciones intracomunitarias: cuando la lectura detecta algo así lo manda a revisión.
- Una factura con varios tipos de IVA se guarda con la base y la cuota sumadas.
- Guarda datos fiscales de terceros: quien la aloje es encargado del tratamiento (RGPD) y necesita contrato con la asesoría, copias de seguridad de `DIR_DATOS` y alojamiento en la UE.
