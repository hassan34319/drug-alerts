// Email content and sending (Amazon SES).
// In the SES sandbox, mail only reaches addresses you have verified in SES.

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Alert } from "./alerts";
import { DISCLAIMER } from "./checkDrug";

export type Email = { to: string; subject: string; text: string; html: string };
export type Mailer = (email: Email) => Promise<void>;

let ses: SESv2Client | undefined;

/** Sends through SES from FROM_EMAIL (set by Terraform). */
export const sesMailer: Mailer = async ({ to, subject, text, html }) => {
  const from = process.env.FROM_EMAIL;
  if (!from) throw new Error("FROM_EMAIL is not set");
  ses ??= new SESv2Client({});
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: `FDA Drug Alert <${from}>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Text: { Data: text }, Html: { Data: html } },
        },
      },
    }),
  );
};

// Which mailer the app uses. SES by default; tests swap in a fake one (same idea as setWatchStore).
let current: Mailer = (e) => sesMailer(e);
export const getMailer = (): Mailer => current;
export function setMailer(m: Mailer) {
  current = m;
}

// Escape user-controlled and FDA text before putting it in HTML.
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const shell = (body: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.5">${body}` +
  `<p style="font-size:12px;color:#777;margin-top:24px">${esc(DISCLAIMER)}</p></div>`;

export function confirmationEmail(to: string, medicines: string[], confirmUrl: string): Email {
  const list = medicines.join(", ");
  return {
    to,
    subject: "Confirm your FDA drug alerts",
    text:
      `Please confirm you want email alerts about new FDA recalls for: ${list}.\n\n` +
      `Confirm: ${confirmUrl}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.\n\n${DISCLAIMER}`,
    html: shell(
      `<p>Please confirm you want email alerts about new FDA recalls for: <b>${esc(list)}</b>.</p>` +
        `<p><a href="${esc(confirmUrl)}" style="background:#1a5fb4;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirm alerts</a></p>` +
        `<p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email and nothing will be sent.</p>`,
    ),
  };
}

export function alertEmail(to: string, alerts: Alert[], unsubscribeUrl: string): Email {
  const urgent = alerts.some((a) => a.class === "Class I");
  const subject = `${urgent ? "Class I recall: " : ""}${alerts.length} new FDA recall${alerts.length > 1 ? "s" : ""} for medicines you watch`;
  const line = (a: Alert) =>
    `${a.class ?? "Unclassified"} | ${a.medicine ?? ""} | reported ${a.reported ?? "?"}\n${a.product ?? ""}\nReason: ${a.reason ?? ""}\nFirm: ${a.firm ?? ""} | Recall ${a.id}`;
  return {
    to,
    subject,
    text:
      `New FDA recalls matching your watchlist:\n\n${alerts.map(line).join("\n\n")}\n\n` +
      `A recall usually covers specific lots. Check the lot number on your pack and ask your pharmacist before changing anything.\n\n` +
      `Unsubscribe: ${unsubscribeUrl}\n\n${DISCLAIMER}`,
    html: shell(
      `<p>New FDA recalls matching your watchlist:</p>` +
        alerts
          .map(
            (a) =>
              `<div style="border-left:4px solid ${a.class === "Class I" ? "#c01c28" : "#e5a50a"};padding:6px 12px;margin:12px 0">` +
              `<b>${esc(a.class ?? "Unclassified")}</b> · ${esc(a.medicine)} · reported ${esc(a.reported)}<br>` +
              `${esc(a.product)}<br><span style="color:#555">Reason: ${esc(a.reason)}</span><br>` +
              `<span style="font-size:12px;color:#777">${esc(a.firm)} · Recall ${esc(a.id)}</span></div>`,
          )
          .join("") +
        `<p style="font-size:13px">A recall usually covers specific lots. Check the lot number on your pack and ask your pharmacist before changing anything.</p>` +
        `<p style="font-size:12px"><a href="${esc(unsubscribeUrl)}">Unsubscribe</a></p>`,
    ),
  };
}
