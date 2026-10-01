import { Resend } from "resend";

const ENTIDADES_HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// `datos.nombre`/`datos.trabajador` vienen de texto libre que un trabajador
// controla 100% desde su propio registro publico (authRouter.register solo
// exige min(2) caracteres, sin restriccion de contenido) -- sin escapar,
// un nombre malicioso se inyecta crudo en el HTML del correo que Resend
// manda a evaluadores reales (terceros), abriendo phishing sobre un canal
// transaccional confiable (hallazgo de auditoria de seguridad 2026-09-21).
function escapeHtml(valor: string | undefined): string {
  return (valor ?? "").replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c]);
}

// Layout base institucional (tabla, no flex/grid -- Outlook desktop no
// soporta CSS moderno). Paleta tomada de client/src/index.css: guinda
// --color-primary-500/600, dorado --color-accent-500. Todo el texto
// interpolado en `cuerpoHtml` ya debe venir de escapeHtml() en el llamador.
function envolverCorreo(tituloInterno: string, cuerpoHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background-color:#611232;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;">SIDCU</span>
          <div style="color:#e8a3b8;font-size:13px;margin-top:2px;">Secretaría de Cultura</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:#27272a;font-size:15px;line-height:1.6;">
          <h1 style="font-size:17px;color:#430c23;margin:0 0 16px;">${tituloInterno}</h1>
          ${cuerpoHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e5e5e5;color:#71717a;font-size:12px;line-height:1.5;">
          Este es un mensaje automático, no respondas a este correo.<br>
          © 2026 Secretaría de Cultura · Sistema Informático de SPDC (SIDCU)
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

const PLANTILLAS: Record<"evaluador_nueva_cuenta" | "evaluador_cuenta_existente", (datos: Record<string, string>) => { subject: string; html: string }> = {
  evaluador_nueva_cuenta: (datos) => ({
    subject: "Fuiste seleccionado como evaluador en SIDCU",
    html: envolverCorreo(
      "Fuiste seleccionado como evaluador",
      `<p>Hola ${escapeHtml(datos.nombre)},</p>
       <p>Fuiste seleccionado para evaluar a <strong>${escapeHtml(datos.trabajador)}</strong> dentro del proceso de Promoción.</p>
       <p>Se creó una cuenta para ti en SIDCU con los siguientes datos de acceso:</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fdf2f5;border-left:4px solid #a57f2c;border-radius:4px;margin:16px 0;">
         <tr><td style="padding:16px 20px;">
           <div style="font-size:13px;color:#52525b;margin-bottom:4px;">Usuario (CURP)</div>
           <div style="font-family:Consolas,monospace;font-size:15px;color:#250613;margin-bottom:12px;">${escapeHtml(datos.curp)}</div>
           <div style="font-size:13px;color:#52525b;margin-bottom:4px;">Contraseña</div>
           <div style="font-family:Consolas,monospace;font-size:15px;color:#250613;">${escapeHtml(datos.passwordTemporal)}</div>
         </td></tr>
       </table>
       <p>Guarda esta contraseña, es la que debes usar cada vez que ingreses — no se te pedirá cambiarla.</p>
       <p><a href="https://sdpc-sidcu.com.mx" style="color:#611232;font-weight:bold;">Ingresar a SIDCU →</a></p>`,
    ),
  }),
  evaluador_cuenta_existente: (datos) => ({
    subject: "Fuiste seleccionado como evaluador en SIDCU",
    html: envolverCorreo(
      "Fuiste seleccionado como evaluador",
      `<p>Hola ${escapeHtml(datos.nombre)},</p>
       <p>Fuiste seleccionado para evaluar a <strong>${escapeHtml(datos.trabajador)}</strong> dentro del proceso de Promoción.</p>
       <p>Ya cuentas con una cuenta en SIDCU — ingresa con tu usuario y contraseña habituales para ver el detalle.</p>
       <p><a href="https://sdpc-sidcu.com.mx" style="color:#611232;font-weight:bold;">Ingresar a SIDCU →</a></p>`,
    ),
  }),
};

// Wrapper delgado sobre el SDK -- sin logica de negocio aqui, igual que
// server/lib/s3.ts. RESEND_API_KEY y RESEND_FROM_EMAIL deben estar en
// .env/Railway (ver CLAUDE.md, Variables de Entorno).
//
// C2 (revision final de rama): el remitente estaba hardcodeado a
// "notificaciones@resend.dev" -- esa direccion es el dominio SANDBOX de
// Resend, que solo entrega a la cuenta de prueba del propio owner de la
// API key, nunca a destinatarios reales. Ahora se lee de
// RESEND_FROM_EMAIL, sin fallback a ninguna direccion (real ni de
// sandbox) -- si falta, se trata igual que RESEND_API_KEY faltante: un
// error de CONFIGURACION, no de envio (ver `configuracionFaltante` abajo
// y procesarLotePendientesCorreo en server/db.ts, hallazgo I6).
export async function enviarCorreoEvaluador(
  destinatario: string,
  plantilla: "evaluador_nueva_cuenta" | "evaluador_cuenta_existente",
  datos: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string; configuracionFaltante?: true }> {
  const remitente = process.env.RESEND_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY no configurada", configuracionFaltante: true };
  }
  if (!remitente) {
    return { ok: false, error: "RESEND_FROM_EMAIL no configurada", configuracionFaltante: true };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, html } = PLANTILLAS[plantilla](datos);
  const { error } = await resend.emails.send({
    from: remitente,
    to: [destinatario],
    subject,
    html,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
