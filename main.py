import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")   # quieter TensorFlow logs

import pickle
import re
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from keras.models import load_model
from pydantic import BaseModel, Field
from tensorflow.keras.preprocessing.sequence import pad_sequences

# ---------------------------------------------------------------------------
# 1. Constants (must match the training notebook)
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "Artifacts" / "BiGRU_Model.keras"
TOKENIZER_PATH = BASE_DIR / "Artifacts" / "tokenizer.pkl"
MAX_SEQUENCE_LENGTH = 50
EMOTION_LABELS = ["sadness", "joy", "love", "anger", "fear", "surprise"]  # = label_names in the notebook


# ---------------------------------------------------------------------------
# 2. Text cleaning: IDENTICAL to preprocess_text in the notebook
# ---------------------------------------------------------------------------
def preprocess_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"'", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# 3. Schemas (field names are used by the frontend: keep them as they are)
# ---------------------------------------------------------------------------
class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The sentence to analyze",
        json_schema_extra={"example": "I feel so happy and excited"},
    )


class PredictionResponse(BaseModel):
    text: str
    predicted_emotion: str
    confidence: float
    all_probabilites: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# ---------------------------------------------------------------------------
# 4. Load model and tokenizer once at startup
# ---------------------------------------------------------------------------
dl_model: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading the model and tokenizer...")
    model = load_model(MODEL_PATH)
    with open(TOKENIZER_PATH, "rb") as file:
        tokenizer = pickle.load(file)

    if model.output_shape[-1] != len(EMOTION_LABELS):
        raise RuntimeError(
            f"Model outputs {model.output_shape[-1]} classes but EMOTION_LABELS has {len(EMOTION_LABELS)}."
        )

    model.predict(np.zeros((1, MAX_SEQUENCE_LENGTH), dtype="int32"), verbose=0)  # warm-up: first request is fast
    dl_model["BiGRU"] = model
    dl_model["Tokenizer"] = tokenizer
    print("Model and tokenizer loaded successfully.")

    yield

    dl_model.clear()


# ---------------------------------------------------------------------------
# 5. App, CORS, static files
# ---------------------------------------------------------------------------
app = FastAPI(title="Emotion Reader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # "*" origins cannot be combined with credentials
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


# ---------------------------------------------------------------------------
# 6. Endpoints
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def server_ui():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(status="Server is running", model_loaded=bool(dl_model))


@app.post("/predict", response_model=PredictionResponse)
def predict_emotion(text_input: TextInput):
    model = dl_model.get("BiGRU")
    tokenizer = dl_model.get("Tokenizer")

    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet. Please try again later.")

    cleaned_text = preprocess_text(text_input.text)
    if not cleaned_text:
        raise HTTPException(status_code=422, detail="Text must contain at least one letter or number.")

    sequence = tokenizer.texts_to_sequences([cleaned_text])
    padded = pad_sequences(sequence, maxlen=MAX_SEQUENCE_LENGTH, padding="post", truncating="post")

    probabilities = model.predict(padded, verbose=0)[0]
    top_index = int(np.argmax(probabilities))

    return PredictionResponse(
        text=text_input.text,
        predicted_emotion=EMOTION_LABELS[top_index],
        confidence=float(probabilities[top_index]),
        all_probabilites={label: float(p) for label, p in zip(EMOTION_LABELS, probabilities)},
    )
