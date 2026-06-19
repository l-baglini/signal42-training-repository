"""Send the morning digest via SMTP. Fully optional: no creds -> no send."""
import os
import smtplib
from email.mime.text import MIMEText


def smtp_configured() -> bool:
    return all([
        os.getenv("SMTP_HOST"),
        os.getenv("SMTP_USER"),
        os.getenv("SMTP_PASS"),
        os.getenv("DIGEST_TO"),
    ])


def send_digest(subject: str, html_body: str) -> tuple[bool, str]:
    if not smtp_configured():
        return False, "SMTP non configurato: digest salvato in-app, non spedito."

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    pwd = os.getenv("SMTP_PASS")
    to = os.getenv("DIGEST_TO")

    msg = MIMEText(html_body, "html", "utf-8")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to

    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(user, pwd)
            server.sendmail(user, [to], msg.as_string())
        return True, f"Digest inviato a {to}."
    except Exception as e:
        return False, f"Invio email fallito: {e}"
