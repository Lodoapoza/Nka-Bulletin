#!/usr/bin/env python3
"""
deploy-ftps.py — Déploiement Nka Bulletin via FTPS (o2switch).

SSH est bloqué (IP non listée) → voie de secours FTPS via ftplib (PROT P).
curl FTPS échoue (451 data connection) → utiliser ftplib.

Identifiants lus depuis backend/.env (FTP_HOST, FTP_USER, FTP_PASS) — jamais en dur.

Chemins serveur (o2switch) :
  - Frontend : racine du domaine ~/nka-bulletin.glocal-innov.com/
  - Backend  : ~/nka-bulletin.glocal-innov.com/nka-bulletin/backend
  - Restart Passenger : touch backend/tmp/restart.txt
"""
import ftplib
import os
import ssl
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
PROJECT = os.path.dirname(ROOT)  # racine du repo
FRONTEND = os.path.join(PROJECT, "frontend")

# --- Identifiants depuis .env -------------------------------------------------
def load_env(path):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

env = load_env(os.path.join(ROOT, ".env"))
HOST = env.get("FTP_HOST", "drive.glocal-innov.com")
USER = env.get("FTP_USER", "sc3sidaou")
PASS = env.get("FTP_PASS", "")

REMOTE_FRONT = "/nka-bulletin.glocal-innov.com"
REMOTE_BACK = "/nka-bulletin.glocal-innov.com/nka-bulletin/backend"

FRONT_WEBROOT = ["index.html", "sworker.js", "manifest.json"]
FRONT_CSS_JS = ["css/app.css"] + [f"js/{f}" for f in [
    "accounts.js", "admin.js", "analyse.js", "app.js", "bulletins.js",
    "capacitor.js", "client.js", "confirm.js", "dashboard.js", "dropdown.js",
    "guided.js", "parcours.js", "pin.js", "reset.js", "settings.js",
    "singleflight.js", "theme.js", "version.js",
]]
FRONT_ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]
BACK_ROOT = ["server.js", "worker.js"]
BACK_SRC = ["db.js", "syncService.js", "period.js", "chunkPlanner.js", "syncJobs.js",
            "imapService.js", "ocrService.js", "pdfService.js", "crypto.js",
            "heartbeat.js", "scheduler.js"]
BACK_ROUTES = ["accounts.js", "admin.js", "analyse.js", "auth.js", "bulletins.js",
               "device.js", "push.js", "settings.js", "sync.js"]


def connect():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ftp = ftplib.FTP_TLS(host=HOST, context=ctx, timeout=60)
    ftp.login(USER, PASS)
    ftp.prot_p()
    print(f"Connecté (FTPS, PROT P) — {HOST}")
    return ftp


def upload(ftp, local, remote):
    with open(local, "rb") as f:
        ftp.storbinary(f"STOR {remote}", f)
    size = os.path.getsize(local)
    print(f"  OK  {os.path.basename(local)} ({size} o)")


def main():
    ftp = connect()
    try:
        print("=== 1/4 Frontend webroot ===")
        for f in FRONT_WEBROOT:
            upload(ftp, os.path.join(FRONTEND, f), f"{REMOTE_FRONT}/{f}")

        print("=== 2/4 Frontend css/ + js/ ===")
        for f in FRONT_CSS_JS:
            upload(ftp, os.path.join(FRONTEND, f), f"{REMOTE_FRONT}/{f}")

        print("=== 2.5/4 Icônes PWA ===")
        for f in FRONT_ICONS:
            upload(ftp, os.path.join(FRONTEND, "icons", f), f"{REMOTE_FRONT}/{f}")

        print("=== 3/4 Backend source ===")
        for f in BACK_ROOT:
            upload(ftp, os.path.join(ROOT, f), f"{REMOTE_BACK}/{f}")
        for f in BACK_SRC:
            upload(ftp, os.path.join(ROOT, "src", f), f"{REMOTE_BACK}/src/{f}")
        for f in BACK_ROUTES:
            upload(ftp, os.path.join(ROOT, "src", "routes", f), f"{REMOTE_BACK}/src/routes/{f}")

        print("=== 4/4 Restart Passenger ===")
        ftp.cwd(REMOTE_BACK)
        try:
            ftp.cwd("tmp")
        except ftplib.error_perm:
            ftp.mkd("tmp")
            ftp.cwd("tmp")
        ftp.storbinary("STOR restart.txt", __import__("io").BytesIO(b""))
        print("  OK  tmp/restart.txt (Passenger va redémarrer)")

        print("\n=== Déploiement FTPS terminé === (SUCCÈS)")
    finally:
        ftp.quit()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nÉCHEC : {e}", file=sys.stderr)
        sys.exit(1)