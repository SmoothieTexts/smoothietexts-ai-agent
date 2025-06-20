# chatbot_api.py – Xalvis backend (STRICT KB logic + greeting fallback only)
import os, ast, re, numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
import openai

# ── 1. Secrets & clients ─────────────────────────────────────────────────────
load_dotenv()
openai.api_key     = os.getenv("OPENAI_API_KEY")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME         = os.getenv("SUPABASE_TABLE_NAME") or "smoothietexts_ai"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 2. Embedding helpers ─────────────────────────────────────────────────────
def get_embedding(text: str) -> list[float]:
    return openai.Embedding.create(
        input=[text],
        model="text-embedding-ada-002"
    )["data"][0]["embedding"]

def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60  # tune as needed

def fetch_best_match(q: str) -> tuple[str, float]:
    q_emb   = get_embedding(q)
    rows    = supabase.table(TABLE_NAME).select("*").execute().data or []
    best, best_score = "", -1
    for r in rows:
        emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
        score = cosine(q_emb, emb)
        if score > best_score:
            best, best_score = r["content"], score
    return best, best_score

# ── 3. Greeting detector ─────────────────────────────────────────────────────
GREETING_RE = re.compile(r"\b(hi|hello|hey|good\s?(morning|afternoon|evening)|what'?s up|howdy)\b", re.I)

def is_greeting(text: str) -> bool:
    return bool(GREETING_RE.search(text.strip()))

# ── 4. Main answer routine ───────────────────────────────────────────────────
def answer(user_q: str) -> str:
    # 1) check knowledge base
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
            messages=[{"role":"user","content":prompt}]
        )
        return resp.choices[0].message.content.strip()

    # 2) small-talk greeting → casual GPT reply
    if is_greeting(user_q):
        resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role":"system",
                 "content":"You are Xalvis, a warm, concise AI assistant for SmoothieTexts. "
                           "Respond with a short, friendly greeting."},
                {"role":"user","content":user_q}
            ]
        )
        return resp.choices[0].message.content.strip()

    # 3) no match & not greeting → direct user to support
    return ("I couldn’t find that in my knowledge base. "
            "Please visit our support page for help: "
            "https://www.smoothietexts.com/contact-us/")

# ── 5. FastAPI server ────────────────────────────────────────────────────────
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
        return {"answer": "Sorry, something went wrong. Please try again later."}
