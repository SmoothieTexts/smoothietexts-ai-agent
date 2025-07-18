# File: chatbot_api.py
# Finalized backend with Google token refresh, Zoom & Acuity support, multi-client handling, and diagnostics

import os
import time
import traceback
import collections
import datetime
import requests
import ast
import re
import json
import pytz

from typing import List
from uuid import uuid4

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from supabase import create_client
from openai import OpenAI

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from dateutil import parser
from datetime import timedelta

# ─── Load ENV ────────────────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
API_TOKEN       = os.getenv("API_TOKEN")
CONFIG_BASE     = os.getenv("CONFIG_URL_BASE") or "https://two47cbackend.onrender.com/configs"
TABLE_KB        = os.getenv("SUPABASE_TABLE_NAME_KB")  or "client_knowledge_base"
TABLE_LOG       = os.getenv("SUPABASE_TABLE_NAME_LOG") or "client_conversations"
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

if not all([SUPABASE_URL, SUPABASE_KEY, API_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET]):
    raise RuntimeError("❌ Missing one or more required environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── App Init ────────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Core Helpers ─────────────────────────────────────────────────────────────
def fetch_config(client_id: str) -> dict:
    try:
        r = requests.get(f"{CONFIG_BASE}/{client_id}.json", timeout=2)
        return r.json() if r.ok else {}
    except:
        return {}

def is_within_available_hours(dt: datetime.datetime, config: dict) -> bool:
    day_name = dt.strftime("%A").lower()  # e.g., 'monday'
    available = config.get("availableHours", {}).get(day_name)
    if not available or len(available) != 2:
        return False
    start_str, end_str = available
    dt_local = dt.time()
    start_parts = [int(p) for p in start_str.split(":")]
    end_parts = [int(p) for p in end_str.split(":")]
    start_time = datetime.time(start_parts[0], start_parts[1])
    end_time = datetime.time(end_parts[0], end_parts[1])
    return start_time <= dt_local <= end_time

def get_openai_client(client_id: str) -> OpenAI:
    key_env = f"OPENAI_API_KEY_{client_id.replace('-', '_').upper()}"
    key = os.getenv(key_env, os.getenv("OPENAI_API_KEY"))
    if not key:
        raise RuntimeError(f"No OpenAI key for client '{client_id}'")
    return OpenAI(api_key=key)

def get_embedding(text: str, client: OpenAI) -> List[float]:
    return client.embeddings.create(model="text-embedding-ada-002", input=[text]).data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a_arr, b_arr = np.array(a), np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr)*np.linalg.norm(b_arr)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q, client_id, openai_client):
    q_emb = get_embedding(q, openai_client)
    rows = supabase.table(TABLE_KB).select("*").eq("client_id", client_id).execute().data or []
    best, best_score = "", -1.0
    for r in rows:
        try:
            emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
            sc = cosine(q_emb, emb)
            if sc > best_score:
                best, best_score = r["content"], sc
        except:
            pass
    return best, best_score

def is_greeting(t: str) -> bool:
    return bool(re.search(r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening))\b", t.strip(), re.I))

RATE_LIMIT, RATE_PERIOD = 30, 60
_hits = {}

def rate_limited(ip: str) -> bool:
    now_ts = time.time()
    bucket = _hits.setdefault(ip, collections.deque())
    while bucket and now_ts - bucket[0] > RATE_PERIOD:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        return True
    bucket.append(now_ts)
    return False

def answer(user_q: str, client_id: str, cfg: dict, oa: OpenAI, history: list = None, booking: dict = None) -> str:
    # Cancellation handling block - always keep this as the FIRST thing!
    if booking and isinstance(booking, dict):
        user_cancel_phrases = [
            "start over",
            "booking cancelled",
            "cancel",
            "i am not booking now",
            "no",
            "never mind",
            "forget it",
            "stop",
            "don't want",
            "not now",
            "exit",
            "nope",
            "quit",
            "back",
            "don’t want",
            "book later",
            "maybe another time",
            "some other time",
            "not booking",
            "not booking now",
            "not booking anymore",
            "don’t want to book",
            "i don't want to book anymore",
            "i’m not booking",
            "will book later"
        ]
        user_q_norm = user_q.strip().lower()
        if any(phrase in user_q_norm for phrase in user_cancel_phrases):
            booking["inProgress"] = False
            booking["date"] = None
            booking["time"] = None
    # ⬆️ END CANCELLATION BLOCK
    ctx, score = fetch_best_match(user_q, client_id, oa)
    history = history or []
    booking = booking or {}

    # Proactive booking interruption
    if booking.get("inProgress") and not any(
        kw in user_q.lower()
        for kw in ["book", "booking", "appointment", "meeting", "schedule", "continue", "confirm", "cancel"]
    ):
        # User has a booking in progress but is asking about something else
        return (
            "🕒 You have a booking in progress"
            f"{' for ' + str(booking.get('date')) if booking.get('date') else ''}"
            f"{' at ' + str(booking.get('time')) if booking.get('time') else ''}.<br>"
            "Would you like to continue your booking or start over? (Type 'continue' or 'start over')"
        )

    if score >= SIM_THRESHOLD:
        # If knowledge base match, just answer with KB context
        prompt = f"You are {cfg.get('chatbotName','Chatbot')}. Answer using ONLY this knowledge:\n\n{ctx}\n\nQ: {user_q}\nA:"
        res = oa.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return res.choices[0].message.content.strip()
    if is_greeting(user_q):
        res = oa.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": f"You are {cfg.get('chatbotName','Chatbot')}."},
                {"role": "user",   "content": user_q}
            ]
        )
        return res.choices[0].message.content.strip()
    # --- NEW: Use conversation history for context-aware prompt ---
    # Build prompt from history (max 5 most recent)
    # --- Use booking context + conversation history ---
    booking_context = ""
    if booking.get("inProgress"):
        booking_context = (
            f"NOTE: The user is currently booking for {booking.get('date', 'unknown date')} at "
            f"{booking.get('time', 'unknown time')}. Respond accordingly.\n"
        )

    prompt = booking_context  # <<-- Always at the top of the prompt!
    for turn in (history[-5:] if len(history) > 5 else history):
        user = turn.get("user", "")
        bot  = turn.get("bot", "")
        prompt += f"User: {user}\nBot: {bot}\n"
    prompt += f"User: {user_q}\nBot:"
    try:
        res = oa.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return res.choices[0].message.content.strip()
    except Exception:
        return "Sorry, there was a problem understanding your last message."

def get_google_credentials_from_env(client_id):
    key = f"GOOGLE_OAUTH_TOKEN_{client_id.upper().replace('-', '_')}"
    token_json = os.getenv(key)
    if not token_json:
        raise HTTPException(400, "Missing Google OAuth token for client")
    info = json.loads(token_json)
    creds = Credentials(
        token=info["access_token"],
        refresh_token=info["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    return creds, info["calendar_id"]

# ─── Debug & Status ───────────────────────────────────────────────────────────
@app.get("/debug/env")
def debug_env(client_id: str = Query(...), token: str = Query("")):
    if token != API_TOKEN:
        raise HTTPException(401, "Bad token")
    cid = client_id.upper().replace("-", "_")
    envs = {
        f"GOOGLE_OAUTH_TOKEN_{cid}": bool(os.getenv(f"GOOGLE_OAUTH_TOKEN_{cid}")),
        f"ZOOM_JWT_{cid}": bool(os.getenv(f"ZOOM_JWT_{cid}")),
        f"ACUITY_USER_ID_{cid}": bool(os.getenv(f"ACUITY_USER_ID_{cid}")),
        f"ACUITY_API_KEY_{cid}": bool(os.getenv(f"ACUITY_API_KEY_{cid}")),
        f"ACUITY_SERVICE_ID_{cid}": bool(os.getenv(f"ACUITY_SERVICE_ID_{cid}"))
    }
    return {"client_id": cid, "env_status": envs}

@app.get("/status/{client_id}")
def provider_status(client_id: str, token: str = Query("")):
    if token != API_TOKEN:
        raise HTTPException(401, "Bad token")

    cid = client_id.strip().upper().replace("-", "_")
    config = fetch_config(client_id)
    active_provider = config.get("bookingProvider")

    status = {
        "activeProvider": active_provider,
        "google": bool(os.getenv(f"GOOGLE_OAUTH_TOKEN_{cid}")),
        "zoom": bool(os.getenv(f"ZOOM_JWT_{cid}")),
        "acuity": all([
            os.getenv(f"ACUITY_USER_ID_{cid}"),
            os.getenv(f"ACUITY_API_KEY_{cid}"),
            os.getenv(f"ACUITY_SERVICE_ID_{cid}")
        ])
    }
    return {
        "client_id": client_id,
        "config_provider": active_provider,
        "available_providers": status
    }

# ─── API Routes ───────────────────────────────────────────────────────────────
@app.post("/chat")
async def chat(req: Request):
    p = await req.json()
    if p.get("token") != API_TOKEN:
        raise HTTPException(401, "Bad token")
    cid = p.get("client_id", "").strip()
    if not cid:
        raise HTTPException(400, "Missing client_id")
    if rate_limited(req.client.host):
        raise HTTPException(429, "Rate limit")

    q = p.get("question", "").strip()
    if not q:
        return {"answer": "Please ask a question 🙂"}

    # NEW: Get optional conversation history
    history = p.get("history", [])   # Array of {user, bot} dicts
    booking = p.get("booking", {})   # <-- Add this line to receive booking info

    cfg = fetch_config(cid)
    oa  = get_openai_client(cid)
    try:
        ans = answer(q, cid, cfg, oa, history, booking)
        return {"answer": ans}
    except Exception:
        traceback.print_exc()
        return {"answer": "Error occurred"}

@app.post("/book")
async def book(req: Request):
    p = await req.json()
    if p.get("token") != API_TOKEN:
        raise HTTPException(401, {"error": "Bad token"})

    cid      = p.get("client_id", "").strip()
    name     = p.get("name")
    email    = p.get("email")
    dt_str   = p.get("datetime")
    timezone = p.get("timezone", "UTC")

    if not all([cid, name, email, dt_str]):
        raise HTTPException(400, {"error": "Missing booking parameters"})

    cfg = fetch_config(cid)
    provider = p.get("bookingProvider") or cfg.get("bookingProvider")

    try:
        import pytz
        dt = parser.isoparse(dt_str)
        tz = pytz.timezone(timezone)
        dt = dt.astimezone(tz)
    except:
        dt = parser.isoparse(dt_str).astimezone(datetime.timezone.utc)

    if not is_within_available_hours(dt, cfg):
        raise HTTPException(409, {"error": "The selected time is outside available hours. Please choose a valid time."})

    duration_minutes = int(cfg.get("meetingDuration", 40))
    window_end = (dt + timedelta(minutes=duration_minutes)).isoformat()

    if provider == "google":
        creds, _ = get_google_credentials_from_env(cid)
        calendar_id = "primary"  # ✅ Force primary to ensure email delivery
        service = build("calendar", "v3", credentials=creds)

        # Check availability first
        freebusy_query = {
            "timeMin": dt.isoformat(),
            "timeMax": window_end,
            "timeZone": timezone,
            "items": [{"id": calendar_id}]
        }
        fb_result = service.freebusy().query(body=freebusy_query).execute()
        busy_times = fb_result["calendars"][calendar_id].get("busy", [])
        if busy_times:
            next_dt = dt
            suggested = None
            for _ in range(5):
                next_dt += timedelta(minutes=30)
                next_end = next_dt + timedelta(hours=1)
                fb_query = {
                    "timeMin": next_dt.isoformat(),
                    "timeMax": next_end.isoformat(),
                    "timeZone": timezone,
                    "items": [{"id": calendar_id}]
                }
                fb_result = service.freebusy().query(body=fb_query).execute()
                if not fb_result["calendars"][calendar_id].get("busy", []):
                    suggested = next_dt
                    break
            if suggested:
                raise HTTPException(409, {
                    "error": "The selected time is not available.",
                    "suggested": suggested.isoformat()
                })
            else:
                raise HTTPException(409, {
                    "error": "The selected time is not available. Please choose another."
                })

        purpose = p.get("purpose", "Appointment via 247Convo")
        event = {
            "summary": f"Meeting with {name}",
            "description": f"Purpose: {purpose}",
            "start": {
                "dateTime": dt.isoformat(),
                "timeZone": timezone
            },
            "end": {
                "dateTime": window_end,
                "timeZone": timezone
            },
            "attendees": [{"email": email}],
            "conferenceData": {
                "createRequest": {
                    "requestId": str(uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"}
                }
            },
            "reminders": {
                "useDefault": True
            }
        }

        created = service.events().insert(
            calendarId=calendar_id,
            body=event,
            conferenceDataVersion=1,
            sendUpdates="all"
        ).execute()

        link = created.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri", "")

    elif provider == "acuity":
        prefix = cid.upper()
        acuity_user = os.getenv(f"ACUITY_USER_ID_{prefix}")
        acuity_key = os.getenv(f"ACUITY_API_KEY_{prefix}")
        service_id = os.getenv(f"ACUITY_SERVICE_ID_{prefix}")
        if not all([acuity_user, acuity_key, service_id]):
            raise HTTPException(400, {"error": "Missing Acuity credentials"})

        purpose = p.get("purpose", "Appointment via 247Convo")

        # 1️⃣ First, get available slots from Acuity for this appointment type and date
        day_str = dt.strftime('%Y-%m-%d')
        slots_url = "https://acuityscheduling.com/api/v1/availability/times"
        slots_params = {
            "appointmentTypeID": int(service_id),
            "date": day_str,
        }
        slots_resp = requests.get(
            slots_url,
            auth=(acuity_user, acuity_key),
            params=slots_params
        )
        if slots_resp.status_code >= 400:
            raise HTTPException(
                slots_resp.status_code,
                {"error": f"Acuity error: {slots_resp.text}"}
            )

        slots = slots_resp.json()  # List of slots [{'time': '2025-08-02T15:00:00-04:00', ...}, ...]
        slot_times = [s['time'] for s in slots]

        # 2️⃣ Check if requested time is available
        requested_iso = dt.isoformat()
        available = any(requested_iso.startswith(t[:19]) for t in slot_times)  # compare date/time only

        if not available:
            # Suggest the next available slot (if any)
            suggested = slot_times[0] if slot_times else None
            if suggested:
                raise HTTPException(
                    409,
                    {
                        "error": "The selected time is not available.",
                        "suggested": suggested
                    }
                )
            else:
                raise HTTPException(
                    409,
                    {
                        "error": "The selected time is not available. Please choose another."
                    }
                )

        # 3️⃣ Book the appointment at the requested available time
        res = requests.post(
            "https://acuityscheduling.com/api/v1/appointments",
            auth=(acuity_user, acuity_key),
            json={
                "firstName": name.split()[0],
                "lastName": name.split()[-1],
                "email": email,
                "datetime": dt.isoformat(),
                "appointmentTypeID": int(service_id),
                "notes": purpose
            }
        )
        if res.status_code >= 400:
            raise HTTPException(
                res.status_code,
                {"error": f"Acuity error: {res.text}"}
            )
        link = res.json().get("confirmationPage")


@app.get("/availability/{client_id}")
def availability(client_id: str, date: str = Query(...), token: str = Query("")):
    if token != API_TOKEN:
        raise HTTPException(401, "Bad token")

    cfg = fetch_config(client_id)
    provider = cfg.get("bookingProvider", "google").lower()  # default to Google if missing

    # --------- ACUITY HANDLING ---------
    if provider == "acuity":
        prefix = client_id.upper()
        acuity_user = os.getenv(f"ACUITY_USER_ID_{prefix}")
        acuity_key = os.getenv(f"ACUITY_API_KEY_{prefix}")
        service_id = os.getenv(f"ACUITY_SERVICE_ID_{prefix}")
        if not all([acuity_user, acuity_key, service_id]):
            raise HTTPException(400, {"error": "Missing Acuity credentials"})

        # Fetch slots from Acuity for this appointment type and date
        slots_url = "https://acuityscheduling.com/api/v1/availability/times"
        slots_params = {
            "appointmentTypeID": int(service_id),
            "date": date,
        }
        slots_resp = requests.get(
            slots_url,
            auth=(acuity_user, acuity_key),
            params=slots_params
        )
        if slots_resp.status_code >= 400:
            raise HTTPException(
                slots_resp.status_code,
                {"error": f"Acuity error: {slots_resp.text}"}
            )
        slots = slots_resp.json()  # [{'time': '2025-08-02T15:00:00-04:00', ...}, ...]
        # Return in same shape as Google: ISO8601 string list
        return {"slots": [s['time'] for s in slots]}

    # --------- GOOGLE HANDLING ---------
    tzname = cfg.get("timezone", "UTC")
    tz = pytz.timezone(tzname)

    try:
        date_obj = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    except:
        raise HTTPException(400, {"error": "Invalid date"})

    start_dt = tz.localize(datetime.datetime.combine(date_obj, datetime.time.min))
    end_dt = start_dt + timedelta(days=1)

    creds, calendar_id = get_google_credentials_from_env(client_id)
    service = build("calendar", "v3", credentials=creds)

    fb_result = service.freebusy().query(body={
        "timeMin": start_dt.isoformat(),
        "timeMax": end_dt.isoformat(),
        "timeZone": tzname,
        "items": [{"id": calendar_id}]
    }).execute()

    busy = fb_result["calendars"][calendar_id].get("busy", [])
    duration = int(cfg.get("meetingDuration", 40))
    available_hours = cfg.get("availableHours", {})
    dayname = date_obj.strftime("%A").lower()
    if dayname not in available_hours:
        return {"slots": []}

    s_hour, e_hour = available_hours[dayname]
    s_h, s_m = map(int, s_hour.split(":"))
    e_h, e_m = map(int, e_hour.split(":"))
    slot_start = tz.localize(datetime.datetime.combine(date_obj, datetime.time(s_h, s_m)))
    slot_end = tz.localize(datetime.datetime.combine(date_obj, datetime.time(e_h, e_m)))

    # Generate possible slots
    step = timedelta(minutes=30)
    slots = []
    current = slot_start
    while current + timedelta(minutes=duration) <= slot_end:
        overlap = any(busy_slot["start"] < (current + timedelta(minutes=duration)).isoformat()
                    and busy_slot["end"] > current.isoformat() for busy_slot in busy)
        if not overlap:
            slots.append(current.isoformat())
        current += step

    return {"slots": slots}


@app.get("/availability/{client_id}/busy")
def availability_busy(client_id: str, date: str = Query(...)):
    cfg = fetch_config(client_id)
    creds, cal_id = get_google_credentials_from_env(client_id)
    service = build("calendar", "v3", credentials=creds)

    date_start = parser.isoparse(date + "T00:00:00Z")
    date_end   = parser.isoparse(date + "T23:59:59Z")

    busy = service.freebusy().query(body={
        "timeMin": date_start.isoformat(),
        "timeMax": date_end.isoformat(),
        "timeZone": "UTC",
        "items": [{"id": cal_id}]
    }).execute()

    return {
        "busy": busy["calendars"][cal_id].get("busy", [])
    }


@app.post("/summary")
async def summary(req: Request):
    p = await req.json()
    if p.get("token") != API_TOKEN:
        raise HTTPException(401, "Bad token")
    name, email, log, cid = p.get("name"), p.get("email"), p.get("chat_log"), p.get("client_id")
    if not all([name, email, log, cid]):
        raise HTTPException(400, {"error": "Missing fields"})
    supabase.table(TABLE_LOG).insert({
        "name": name,
        "email": email,
        "chat_log": log,
        "client_id": cid,
        "token": p["token"],
        "timestamp": datetime.datetime.utcnow().isoformat()
    }).execute()
    return {"status": "saved"}

@app.post("/rating")
async def rating(req: Request):
    p = await req.json()
    client_id = p.get("client_id")
    name = p.get("name")
    email = p.get("email")
    score = p.get("score")
    context = p.get("context", [])
    created = datetime.datetime.utcnow().isoformat()
    # Insert into chat_ratings table (your schema)
    try:
        supabase.table("chat_ratings").insert({
            "client_id": client_id,
            "name": name,
            "email": email,
            "score": int(score) if score else None,
            "context": json.dumps(context),  # Store as JSONB
            "created_at": created
        }).execute()
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"error": f"Could not save rating: {str(e)}"}, status_code=500)


@app.get("/configs/{client_id}.json")
async def get_config_file(client_id: str):
    fp = os.path.join("configs", f"{client_id}.json")
    if not os.path.exists(fp):
        raise HTTPException(404, {"error": "Not found"})
    data = open(fp, "rb").read()
    return Response(
        content=data,
        media_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.get("/static/{path:path}")
async def static_file(path: str):
    fp = os.path.join("static", path)
    if not os.path.exists(fp):
        raise HTTPException(404, {"error": "Not found"})
    data = open(fp, "rb").read()
    mt = "text/html" if fp.endswith(".html") else "application/octet-stream"
    return Response(
        content=data,
        media_type=mt,
        headers={"Access-Control-Allow-Origin": "*"}
    )
