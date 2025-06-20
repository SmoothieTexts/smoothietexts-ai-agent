# chatbot_api.py  – Xalvis backend (STRICT KB logic + env-debug)

import os, ast, re, traceback, numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
import openai

# ── 1. Secrets & clients ──────────────────────────────────────────────────
load_dotenv()                                           # load .env if present

openai.api_key   = os.getenv("OPENAI_API_KEY")
SUPABASE_URL     = os.getenv("SUPABASE_URL")
SUPABASE_KEY     = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME       = os.getenv("SUPABASE_TABLE_NAME") or "smoothietexts_ai"

def _mask(val: str | None) -> str:
    """Return a partially-masked version for safe logging."""
    if not val:
        return "❌ NONE"
    return val[:4] + "…(hidden)…" + val[-4:]

print("🔧 ENV CHECK ─────────────────────────────")
print("OPENAI_API_KEY     :", _mask(openai.api_key))
print("SUPABASE_URL       :", SUPABASE_URL or "❌ NONE")
print("SUPABASE_ROLE_KEY  :", _mask(SUPABASE_KEY))
print("TABLE_NAME         :", TABLE_NAME)
print("──────────────────────────────────────────")

if not (openai.api_key and SUPABASE_URL and SUPABASE_KEY):
    raise RuntimeError("❌ One or more critical env vars are missing!")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 2. Embedding helpers ────────────────────────────────────────────────
def get_embedding(text: str) -> list[float]:
    """Return ADA-002 embedding for the text."""
    return openai.Embedding.create(
        input=[text],
        model="text-embedding-ada-002"
    )["data"][0]["embedding"]

def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60         # similarity cut-off

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
    # 1️⃣  Try knowledge-base
    context, score = fetch_best_match(user_q)
    if score >= SIM_THRESHOLD:
        prompt = (
            "You are Xalvis, the friendly AI agent for SmoothieTexts.\n"
            "Answer ONLY with the information in the Knowledge below.\n\n"
            f"Knowledge:\n{context}\n\n"
            f"User Question: {user_q}\nAnswer:"
        )
        resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return resp.choices[0].message.content.strip()

    # 2️⃣  Greetings → brief chat reply
    if is_greeting(user_q):
        resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system",
                 "content": "You are Xalvis, a warm, concise AI assistant for "
                            "SmoothieTexts. Respond with a short, friendly greeting."},
                {"role": "user", "content": user_q}
            ]
        )
        return resp.choices[0].message.content.strip()

    # 3️⃣  Otherwise point user to support
    return ("I couldn’t find that in my knowledge base. "
            "Please visit our support page for help: "
            "https://www.smoothietexts.com/contact-us/")

# ── 5. FastAPI app ──────────────────────────────────────────────────────
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
    except Exception as e:
        # full traceback to Render logs for easy debugging
        print("❌ CRASH in /chat ————————————————")
        traceback.print_exc()
        print("———————————————————————————————————")
        return {"answer": "Sorry, something went wrong. Please try again later."}
