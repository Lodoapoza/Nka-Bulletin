#!/usr/bin/env python3
"""Configure Android release signing (CI only).

Lit les secrets GitHub via variables d'environnement, écrit android/keystore.properties
et injecte le signingConfig release dans android/app/build.gradle AVANT assembleRelease.

Workdir attendu: app/ (root du projet Capacitor).
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path.cwd()
GRADLE = ROOT / "android" / "app" / "build.gradle"
PROPS = ROOT / "android" / "keystore.properties"

required = ["ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]
missing = [v for v in required if not os.environ.get(v)]
if missing:
    sys.exit("ERREUR: secrets manquants: " + ", ".join(missing))
if not GRADLE.exists():
    sys.exit(f"ERREUR: {GRADLE} introuvable (workdir = {ROOT})")

PROPS.write_text(
    "storeFile=../../nka-release.keystore\n"
    f"storePassword={os.environ['ANDROID_KEYSTORE_PASSWORD']}\n"
    f"keyAlias={os.environ['ANDROID_KEY_ALIAS']}\n"
    f"keyPassword={os.environ['ANDROID_KEY_PASSWORD']}\n"
)

src = GRADLE.read_text()

signing_block = """    signingConfigs {
        release {
            def props = new Properties()
            def f = rootProject.file('keystore.properties')
            if (f.exists()) props.load(new FileInputStream(f))
            storeFile file(props['storeFile'])
            storePassword props['storePassword']
            keyAlias props['keyAlias']
            keyPassword props['keyPassword']
        }
    }
"""

if "signingConfigs" not in src:
    src, n = re.subn(
        r"(?m)^(\s*)buildTypes \{",
        lambda m: signing_block + m.group(1) + "buildTypes {",
        src,
        count=1,
    )
    if n != 1:
        sys.exit("ERREUR: bloc buildTypes introuvable dans build.gradle")

if "signingConfig signingConfigs.release" not in src:
    # Anchored sur buildTypes { pour ne pas injecter dans signingConfigs.release
    src, n = re.subn(
        r"(?m)^(\s*)buildTypes \{\n(\s*release \{\n)(\s*)",
        lambda m: m.group(1) + "buildTypes {\n"
        + m.group(2) + m.group(3) + "signingConfig signingConfigs.release\n"
        + m.group(3),
        src,
        count=1,
    )
    if n != 1:
        sys.exit("ERREUR: bloc buildTypes.release introuvable dans build.gradle")

GRADLE.write_text(src)
print("OK: signingConfig release injecté dans", GRADLE.relative_to(ROOT))
