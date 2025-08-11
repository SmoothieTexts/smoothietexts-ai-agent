# upload.py  — OpenAI SDK >= 1.0 compatible
from openai import OpenAI
import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Create OpenAI client (reads OPENAI_API_KEY from env)
client = OpenAI()

# Set up Supabase URL/Key (from .env)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Set the client ID (this acts as both client_id and token)
client_id = "smoothietexts"  # 🔁 Change this per client

# Load the knowledge base from the text file
with open("knowledge.txt", "r", encoding="utf-8") as f:
    knowledge_text = f.read()

# Create embedding using OpenAI (new SDK syntax)
print("🧠 Creating Embedding...")
resp = client.embeddings.create(
    model="text-embedding-3-small",   # or "text-embedding-3-large"
    input=knowledge_text
)
embedding = resp.data[0].embedding

# Prepare headers and data for Supabase
print("🚀 Uploading to Supabase...")
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"  # optional: return inserted row
}

data = {
    "client_id": client_id,
    "token": client_id,
    "content": knowledge_text,
    "embedding": embedding
}

# Send data to Supabase
response = requests.post(
    f"{SUPABASE_URL}/rest/v1/client_knowledge_base",
    headers=headers,
    json=data,
    timeout=60
)

# Check result
if response.status_code in (200, 201):
    print("✅ Upload successful!")
else:
    print(f"❌ Upload failed: {response.status_code} - {response.text}")
