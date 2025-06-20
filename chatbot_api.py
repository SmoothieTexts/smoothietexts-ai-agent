# chatbot_api.py – Xalvis backend (STRICT KB logic + env-debug, SDK v1)

import os, ast, re, traceback, numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI                           # ← NEW import

# ── 1. Secrets & clients ──────────────────────────────────────────────────
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL   = os.getenv("SUPABASE_URL")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME     = os.getenv("SUPABASE_TABLE_NAME") or "smoothietexts_ai"

def _mask(val: str | None) -> str:
    if not val:
        return "❌ NONE"
    return val[:4] + "…(hidden)…" + val[-4:]

print("🔧 ENV CHECK ─────────────────────────────")
print("OPENAI_API_KEY     :", _mask(OPENAI_API_KEY))
print("SUPABASE_URL       :", SUPABASE_URL or "❌ NONE")
print("SUPABASE_ROLE_KEY  :", _mask(SUPABASE_KEY))
print("TABLE_NAME         :", TABLE_NAME)
print("──────────────────────────────────────────")

if not (OPENAI_API_KEY and SUPABASE_URL and SUPABASE_KEY):
    raise RuntimeError("❌ One or more critical env vars are missing!")

client    = OpenAI(api_key=OPENAI_API_KEY)          # ← NEW client
supabase  = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 2. Embedding helpers ────────────────────────────────────────────────
def get_embedding(text: str) -> list[float]:
    """Return ADA-002 embedding for the text (SDK v1)."""
    resp = client.embeddings.create(
        model="text-embedding-ada-002",
        input=[text]
    )
    return resp.data[0].embedding                   # ← NEW access pattern

def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q: str) -> tuple[str, float]:
    q_emb = get_embedding(q)
    rows  = supabase.table(TABLE_NAME).select("*").execute().data or []
    best_txt, best_score = "", -1
    for r in rows:
        emb = r["embedding"]
        if isinstance(emb, str):
            emb = ast.literal_eval(emb)
        score = cosine(q_emb, emb)
        if score > best_score:
            best_txt, best_score = r["content"], score
    return best_txt, best_score

# ── 3. Greeting detector ────────────────────────────────────────────────
GREETING_RE = re.compile(
    r"\b(hi|hello|hey|good\s?(morning|afternoon|evening)|howdy|what'?s up)\b",
    re.I
)
def is_greeting(txt: str) -> bool:
    return bool(GREETING_RE.search(txt.strip()))

# ── 4. Main answer routine ──────────────────────────────────────────────
def answer(user_q: str) -> str:
    # 1️⃣  Knowledge-base first
    context, score = fetch_best_match(user_q)
    if score >= SIM_THRESHOLD:
        prompt = (
            "You are Xalvis, the friendly AI agent for SmoothieTexts.\n"
            "Answer ONLY with the information in the Knowledge below.\n\n"
            f"Knowledge:\n{context}\n\n"
            f"User Question: {user_q}\nAnswer:"
        )
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return resp.choices[0].message.content.strip()

    # 2️⃣  Greetings → short friendly reply
    if is_greeting(user_q):
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system",
                 "content": "You are Xalvis, a warm, concise AI assistant for "
                            "SmoothieTexts. Respond with a short, friendly greeting."},
                {"role": "user", "content": user_q}
            ]
        )
        return resp.choices[0].message.content.strip()

    # 3️⃣  Otherwise point to support
    return ("I couldn’t find that in my knowledge base. "
            "Please visit our support page for help: "
            "https://www.smoothietexts.com/contact-us/")

# ── 5. FastAPI server ──────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.post("/chat")
async def chat(req: Request):
    data   = await req.json()
    user_q = data.get("question", "").strip()

    if not user_q:
        return {"answer": "Please type a question 🙂"}

    try:
        return {"answer": answer(user_q)}
    except Exception:
        print("❌ CRASH in /chat ————————————————")
        traceback.print_exc()
        print("———————————————————————————————————")
        return {"answer": "Sorry, something went wrong. Please try again later."}
