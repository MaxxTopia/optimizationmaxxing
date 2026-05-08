import os
from google import genai

c = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
for m in [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
]:
    try:
        r = c.models.generate_content(model=m, contents="Reply with only OK")
        text = (r.text or "").strip()[:8]
        print(f"{m:30s} -> OK ({text})")
    except Exception as e:
        print(f"{m:30s} -> {str(e)[:90]}")
