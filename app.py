"""
Отдаёт два сайта с одного бэкенда и принимает желания с ритуального сайта.

  /               -> site/index.html, Кэш-расклад-Белая-Кошка (основной сайт на домене)
  /mesto-sily     -> gora/index.html, старый ритуальный сайт "гора желаний"
  POST /wish      -> сохраняет желание с ритуального сайта и шлёт уведомление в Телеграм

Переменные окружения:
  TELEGRAM_BOT_TOKEN — токен бота, для отправки уведомлений
  ADMIN_CHAT_ID — твой user_id в Телеграме, куда слать уведомления
  DB_DIR — путь к постоянному диску (Railway volume), по умолчанию рядом со скриптом
  ALLOWED_ORIGIN — домен сайта, с которого разрешены запросы (* по умолчанию)
"""

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=None)
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
CORS(app, resources={r"/wish": {"origins": ALLOWED_ORIGIN}})

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID")
DB_DIR = Path(os.environ.get("DB_DIR", str(Path(__file__).parent)))
DB_PATH = DB_DIR / "wishes.db"


TIMER_DURATION = timedelta(minutes=15)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS wishes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            name TEXT,
            wish TEXT,
            step TEXT
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS ip_timers (
            ip TEXT PRIMARY KEY,
            deadline TEXT
        )"""
    )
    return conn


def client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def notify_admin(name: str, wish: str, step: str):
    if not (BOT_TOKEN and ADMIN_CHAT_ID):
        return
    text = f"Новое желание на сайте.\nИмя: {name or 'не указано'}\nЖелание: {wish}"
    if step:
        text += f"\nОтветный шаг: {step}"
    try:
        requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": ADMIN_CHAT_ID, "text": text},
            timeout=10,
        )
    except requests.RequestException:
        pass


@app.route("/wish", methods=["POST"])
def add_wish():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()[:200]
    wish = (data.get("wish") or "").strip()[:2000]
    step = (data.get("step") or "").strip()[:500]

    if not wish:
        return jsonify({"ok": False, "error": "wish required"}), 400

    conn = db()
    conn.execute(
        "INSERT INTO wishes (created_at, name, wish, step) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(), name, wish, step),
    )
    conn.commit()
    conn.close()

    notify_admin(name, wish, step)
    return jsonify({"ok": True})


@app.route("/timer-state")
def timer_state():
    ip = client_ip()
    now = datetime.now(timezone.utc)

    conn = db()
    row = conn.execute("SELECT deadline FROM ip_timers WHERE ip = ?", (ip,)).fetchone()
    if row:
        deadline = datetime.fromisoformat(row[0])
    else:
        deadline = now + TIMER_DURATION
        conn.execute(
            "INSERT INTO ip_timers (ip, deadline) VALUES (?, ?)",
            (ip, deadline.isoformat()),
        )
        conn.commit()
    conn.close()

    seconds_left = max(0, int((deadline - now).total_seconds()))
    return jsonify({"expired": seconds_left <= 0, "secondsLeft": seconds_left})


SITE_DIR = Path(__file__).parent / "site"
GORA_DIR = Path(__file__).parent / "gora"


def _no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/")
def site():
    return _no_store(send_from_directory(SITE_DIR, "index.html"))


@app.route("/<path:filename>")
def site_files(filename):
    if (SITE_DIR / filename).is_file():
        response = send_from_directory(SITE_DIR, filename)
        if filename.endswith((".html", ".css", ".js")):
            response = _no_store(response)
        return response
    return jsonify({"ok": False, "error": "not found"}), 404


@app.route("/mesto-sily")
def gora_site():
    return _no_store(send_from_directory(GORA_DIR, "index.html"))


@app.route("/mesto-sily/assets/<path:filename>")
def gora_assets(filename):
    return send_from_directory(GORA_DIR / "assets", filename)


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
