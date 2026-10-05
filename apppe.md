[app.py](https://github.com/user-attachments/files/33055338/app.py)
"""
Отдаёт два сайта с одного бэкенда и принимает желания с ритуального сайта.

  /               -> site/index.html, Кэш-расклад-Белая-Кошка (основной сайт на домене)
  /mesto-sily     -> gora/index.html, старый ритуальный сайт "гора желаний"
  POST /wish      -> сохраняет желание с ритуального сайта и шлёт уведомление в Телеграм
  /zhelaniya      -> wall/index.html, «Стена желаний» (желание за 99 ₽, его могут исполнить другие)
  /wall/...       -> API стены: отправка, список, «исполнить», админка модерации

Переменные окружения:
  TELEGRAM_BOT_TOKEN — токен бота, для отправки уведомлений
  ADMIN_CHAT_ID — твой user_id в Телеграме, куда слать уведомления
  DB_DIR — путь к постоянному диску (Railway volume), по умолчанию рядом со скриптом
  ALLOWED_ORIGIN — домен сайта, с которого разрешены запросы (* по умолчанию)
  WALL_PAY_URL — ссылка на оплату размещения желания (lava.top), подставляется на страницу
  WALL_PRICE — цена размещения для текста на странице, по умолчанию 99
  ADMIN_KEY — секретное слово для админки /wall/admin?key=...
  PUBLIC_URL — адрес сайта для ссылок в уведомлениях, по умолчанию https://www.dariapurr.com
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


# ---------------------------------------------------------------------------
# Стена желаний
# ---------------------------------------------------------------------------

import html
import secrets
from collections import defaultdict, deque

WALL_DIR = Path(__file__).parent / "wall"
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://www.dariapurr.com").rstrip("/")

_hits = defaultdict(deque)


def rate_limited(bucket: str, limit: int, per_seconds: int) -> bool:
    """Простая защита от спама: не больше limit запросов с одного IP за окно."""
    key = (bucket, client_ip())
    now = datetime.now(timezone.utc).timestamp()
    q = _hits[key]
    while q and q[0] < now - per_seconds:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


def wall_db():
    conn = db()
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS wall (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            created_at TEXT,
            name TEXT,
            wish TEXT,
            cost TEXT,
            contact TEXT,
            email TEXT,
            status TEXT DEFAULT 'pending',
            published_at TEXT,
            fulfilled_at TEXT
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS wall_offers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            wish_id INTEGER,
            contact TEXT,
            message TEXT
        )"""
    )
    return conn


def tg(text: str):
    if not (BOT_TOKEN and ADMIN_CHAT_ID):
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": ADMIN_CHAT_ID, "text": text, "disable_web_page_preview": True},
            timeout=10,
        )
    except requests.RequestException:
        pass


def clean(value, limit: int) -> str:
    return (value or "").strip()[:limit]


@app.route("/zhelaniya")
def wall_page():
    return _no_store(send_from_directory(WALL_DIR, "index.html"))


@app.route("/zhelaniya/assets/<path:filename>")
def wall_assets(filename):
    return send_from_directory(WALL_DIR / "assets", filename)


@app.route("/wall/config")
def wall_config():
    return jsonify({
        "payUrl": os.environ.get("WALL_PAY_URL", ""),
        "price": os.environ.get("WALL_PRICE", "99"),
    })


@app.route("/wall/wish", methods=["POST"])
def wall_add():
    if rate_limited("wish", 5, 3600):
        return jsonify({"ok": False, "error": "too many"}), 429
    data = request.get_json(silent=True) or {}
    wish = clean(data.get("wish"), 280)
    contact = clean(data.get("contact"), 120)
    email = clean(data.get("email"), 120)
    if len(wish) < 5 or not (contact or email):
        return jsonify({"ok": False, "error": "wish and contact required"}), 400
    name = clean(data.get("name"), 40)
    cost = clean(data.get("cost"), 40)
    code = secrets.token_hex(3).upper()

    conn = wall_db()
    conn.execute(
        "INSERT INTO wall (code, created_at, name, wish, cost, contact, email) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (code, datetime.now(timezone.utc).isoformat(), name, wish, cost, contact, email),
    )
    conn.commit()
    conn.close()

    tg(
        f"Новое желание на стену, код {code}\n"
        f"Имя на стене: {name or 'Аноним'}\n"
        f"Желание: {wish}\n"
        f"Примерная стоимость: {cost or 'не указана'}\n"
        f"Контакт: {contact or '-'}\nEmail: {email or '-'}\n\n"
        f"Сверь оплату и опубликуй: {PUBLIC_URL}/wall/admin?key=..."
    )
    return jsonify({"ok": True, "code": code})


@app.route("/wall/list")
def wall_list():
    conn = wall_db()
    rows = conn.execute(
        """SELECT id, name, wish, cost, status, published_at FROM wall
           WHERE status IN ('published', 'fulfilled')
           ORDER BY status = 'fulfilled' DESC, published_at DESC LIMIT 300"""
    ).fetchall()
    fulfilled = conn.execute("SELECT COUNT(*) FROM wall WHERE status = 'fulfilled'").fetchone()[0]
    conn.close()
    return jsonify({
        "wishes": [
            {"id": r["id"], "name": r["name"] or "Аноним", "wish": r["wish"],
             "cost": r["cost"], "fulfilled": r["status"] == "fulfilled"}
            for r in rows
        ],
        "total": len(rows),
        "fulfilled": fulfilled,
    })


@app.route("/wall/fulfill", methods=["POST"])
def wall_fulfill():
    if rate_limited("fulfill", 10, 3600):
        return jsonify({"ok": False, "error": "too many"}), 429
    data = request.get_json(silent=True) or {}
    try:
        wish_id = int(data.get("id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad id"}), 400
    contact = clean(data.get("contact"), 120)
    message = clean(data.get("message"), 500)
    if not contact:
        return jsonify({"ok": False, "error": "contact required"}), 400

    conn = wall_db()
    row = conn.execute(
        "SELECT * FROM wall WHERE id = ? AND status = 'published'", (wish_id,)
    ).fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "error": "not found"}), 404
    conn.execute(
        "INSERT INTO wall_offers (created_at, wish_id, contact, message) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(), wish_id, contact, message),
    )
    conn.commit()
    conn.close()

    tg(
        f"Кто-то хочет исполнить желание {row['code']}!\n"
        f"Желание: {row['wish']}\n"
        f"Автор желания: {row['contact'] or '-'} / {row['email'] or '-'}\n\n"
        f"Исполнитель: {contact}\nСообщение: {message or '-'}"
    )
    return jsonify({"ok": True})


ADMIN_HTML = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Модерация стены</title>
<style>body{{font-family:-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#f6f3ee;color:#222}}
.w{{background:#fff;border-radius:10px;padding:14px;margin:10px 0;border:1px solid #e3dccf}}
.m{{color:#777;font-size:13px}}form{{display:inline}}button{{margin:8px 6px 0 0;padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}}
.pub{{background:#2e7d32;color:#fff;border:none}}h2{{margin-top:28px}}</style></head><body>
<h1>Стена желаний</h1><p class="m">Сначала сверь email или контакт с оплатами в lava.top, потом публикуй.</p>
{sections}</body></html>"""


def _admin_ok() -> bool:
    key = request.values.get("key", "")
    return bool(ADMIN_KEY) and secrets.compare_digest(key, ADMIN_KEY)


@app.route("/wall/admin", methods=["GET", "POST"])
def wall_admin():
    if not _admin_ok():
        return "Нет доступа", 403
    conn = wall_db()
    if request.method == "POST":
        action = request.form.get("action")
        wid = request.form.get("id")
        now = datetime.now(timezone.utc).isoformat()
        if action == "publish":
            conn.execute("UPDATE wall SET status='published', published_at=? WHERE id=?", (now, wid))
        elif action == "reject":
            conn.execute("UPDATE wall SET status='rejected' WHERE id=?", (wid,))
        elif action == "fulfilled":
            conn.execute("UPDATE wall SET status='fulfilled', fulfilled_at=? WHERE id=?", (now, wid))
        elif action == "unpublish":
            conn.execute("UPDATE wall SET status='pending' WHERE id=?", (wid,))
        conn.commit()

    key = html.escape(request.values.get("key", ""))
    buttons = {
        "pending": [("publish", "Оплачено, опубликовать", "pub"), ("reject", "Отклонить", "")],
        "published": [("fulfilled", "Отметить исполненным", "pub"), ("unpublish", "Снять со стены", "")],
        "fulfilled": [("unpublish", "Снять со стены", "")],
    }
    titles = {"pending": "Ждут проверки оплаты", "published": "На стене", "fulfilled": "Исполнены"}
    sections = []
    for status, title in titles.items():
        rows = conn.execute(
            "SELECT * FROM wall WHERE status=? ORDER BY id DESC LIMIT 200", (status,)
        ).fetchall()
        items = []
        for r in rows:
            offers = conn.execute(
                "SELECT contact, message FROM wall_offers WHERE wish_id=?", (r["id"],)
            ).fetchall()
            offers_html = "".join(
                f"<div class='m'>Хотят исполнить: {html.escape(o['contact'])} · {html.escape(o['message'] or '')}</div>"
                for o in offers
            )
            btns = "".join(
                f"<form method='post'><input type='hidden' name='key' value='{key}'>"
                f"<input type='hidden' name='id' value='{r['id']}'>"
                f"<button class='{cls}' name='action' value='{a}'>{label}</button></form>"
                for a, label, cls in buttons[status]
            )
            items.append(
                f"<div class='w'><b>{html.escape(r['wish'])}</b>"
                f"<div class='m'>Код {r['code']} · {html.escape(r['name'] or 'Аноним')} · "
                f"стоимость: {html.escape(r['cost'] or '-')}</div>"
                f"<div class='m'>Контакт: {html.escape(r['contact'] or '-')} · email: {html.escape(r['email'] or '-')}</div>"
                f"{offers_html}{btns}</div>"
            )
        sections.append(f"<h2>{title} ({len(rows)})</h2>" + ("".join(items) or "<p class='m'>Пусто</p>"))
    conn.close()
    return ADMIN_HTML.format(sections="".join(sections))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
