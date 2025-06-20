import os
import openai
import numpy as np
import ast
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME = os.getenv("SUPABASE_TABLE_NAME")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize clients
openai.api_key = OPENAI_API_KEY
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Get embedding from OpenAI
def get_embedding(text):
    embedding_response = openai.Embedding.create(
        input=[text],
        model="text-embedding-ada-002"
    )
    return embedding_response["data"][0]["embedding"]

# Search Supabase for the best match
def search_supabase(query):
    query_embedding = get_embedding(query)

    response = supabase.table(TABLE_NAME).select("*").execute()
    rows = response.data

    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    best_match = None
    best_score = -1

    for row in rows:
        row_embedding = ast.literal_eval(row["embedding"])  # Convert string to list
        score = cosine_similarity(query_embedding, row_embedding)
        if score > best_score:
            best_score = score
            best_match = row

    return best_match["content"] if best_match else "Sorry, I couldn’t find anything helpful for that."

# Chat with user
def chat(user_question):
    result = search_supabase(user_question)

    prompt = f"""
You are a friendly support agent for SmoothieTexts. A customer asked: "{user_question}"

Here’s the best information you have to help them: "{result}"

Answer in a helpful and concise way. Don’t mention that you searched a database.
"""

    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a SmoothieTexts support assistant."},
            {"role": "user", "content": prompt}
        ]
    )

    return response["choices"][0]["message"]["content"]

# Main loop
print("🤖 Hi! My name is Xalvis, SmoothieTexts AI Agent. How can I help you today?. Type 'exit' to quit.")
while True:
    user_input = input("You: ")
    if user_input.lower() == "exit":
        break
    try:
        answer = chat(user_input)
        print("Xalvis:", answer)
    except Exception as e:
        print("⚠️ Something went wrong:", e)
