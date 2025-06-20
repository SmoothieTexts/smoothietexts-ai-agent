# ─────────────────────────────────────────────────────────────────────────────
#  chatbot_api.py – Xalvis backend (STRICT KB logic + security hardening)
#  ────────────────────────────────────────────────────────────────────────────
import os, ast, re, traceback, time, collections, numpy as np
from typing import List, Tuple
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI         # SDK v1
# ─────────────────────────────────────────────────────────────────────────────

# 1. ─── Secrets & clients ────────────────────────────────────────────────────
load_dotenv()                                           # reads .env locally (Render uses dashboard env-vars)

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY")
SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME      = os.getenv("SUPABASE_TABLE_NAME") or "smoothietexts_ai"

# The ONE place we ever print secrets – masked – for log debugging.
def _mask(s: str | None) -> str: return f"{s[:4]}…{s[-4:]}" if s else "❌ NONE"

print("🔧 ENV CHECK → OPENAI:", _mask(OPENAI_API_KEY),
      "| SUPABASE URL:", SUPABASE_URL or "❌ NONE")

if not all([OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY]):
    raise RuntimeError("❌ Critical env-vars missing – refusing to boot!")

openai_client = OpenAI(api_key=OPENAI_API_KEY)
supabase      = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. ─── Embeddings / similarity ─────────────────────────────────────────────
def get_embedding(text: str) -> List[float]:
    """Return text-embedding-ada-002 vector."""
    resp = openai_client.embeddings.create(
        model="text-embedding-ada-002",
        input=[text]
    )
    return resp.data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60   # > 0.6 ⇒ we trust the KB hit

def fetch_best_match(q: str) -> Tuple[str, float]:
    q_emb   = get_embedding(q)
    rows    = supabase.table(TABLE_NAME).select("*").execute().data or []
    best, best_score = "", -1.0
    for r in rows:
        emb = r["embedding"]
        if isinstance(emb, str):
            emb = ast.literal_eval(emb)
        score = cosine(q_emb, emb)
        if score > best_score:
            best, best_score = r["content"], score
    return best, best_score

# 3. ─── Greeting detector  ──────────────────────────────────────────────────
GREETING_RE = re.compile(r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening))\b", re.I)
def is_greeting(t: str) -> bool: return bool(GREETING_RE.search(t.strip()))

# 4. ─── VERY light-weight rate limiting (IP-bucket, in-memory) ──────────────
# Render dyno restarts clear the store, which is OK for basic abuse-protection.
RATE_LIMIT        = 30             # requests
RATE_PERIOD       = 60             # seconds (30 req / minute / IP)
_ip_hits: dict[str, collections.deque] = {}

def rate_limited(ip: str) -> bool:
    now = time.time()
    bucket = _ip_hits.setdefault(ip, collections.deque())
    while bucket and now - bucket[0] > RATE_PERIOD:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        return True
    bucket.append(now)
    return False

# 5. ─── Main answer routine  ────────────────────────────────────────────────
def answer(user_q: str) -> str:
    # 1️⃣  Try KB first
    context, score = fetch_best_match(user_q)
    if score >= SIM_THRESHOLD:
        prompt = (
            "You are Xalvis, the friendly AI agent for SmoothieTexts.\n"
            "Answer ONLY with the information in the Knowledge below.\n\n"
            f"Knowledge:\n{context}\n\n"
            f"User Question: {user_q}\nAnswer:"
        )
        chat = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return chat.choices[0].message.content.strip()

    # 2️⃣  Friendly greeting fallback
    if is_greeting(user_q):
        chat = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system",
                 "content": "You are Xalvis, a warm, concise AI assistant for SmoothieTexts. "
                            "Respond with a short friendly greeting."},
                {"role": "user", "content": user_q}
            ]
        )
        return chat.choices[0].message.content.strip()

    # 3️⃣  Nothing relevant → support hand-off
    return ("I couldn’t find that in my knowledge base. "
            "Please visit our support page for help: "
            "https://www.smoothietexts.com/contact-us/")

# 6. ─── FastAPI app / security middleware  ─────────────────────────────────
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.smoothietexts.com"],  # ← LOCKED to your domain
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

@app.post("/chat")
async def chat(req: Request):
    # —─ 6.1 Rate-limit by IP
    client_ip = req.client.host or "unknown"
    if rate_limited(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests – please slow down.")

    payload = await req.json()
    user_q  = str(payload.get("question", "")).strip()
    if not user_q:
        return {"answer": "Please type a question 🙂"}

    try:
        return {"answer": answer(user_q)}
    except Exception:
        print("❌ CRASH in /chat")
        traceback.print_exc()
        return {"answer": "Sorry, something went wrong. Please try again later."}
