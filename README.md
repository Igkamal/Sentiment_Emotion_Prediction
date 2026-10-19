# Emotion Reader

A FastAPI app that classifies text into six emotions (sadness, joy, love, anger, fear, surprise) with a BiGRU model. It ships with a single-page UI whose background shifts colour to match the detected emotion.

## Project structure

```
.
├── main.py                  # FastAPI backend
├── Artifacts/
│   ├── BiGRU_Model.keras
│   ├── tokenizer.pkl
│   └── versions.txt
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── requirements.txt
├── runtime.txt / .python-version
├── render.yaml
└── README.md
```

## Run locally

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open http://127.0.0.1:8000. API docs are at `/docs`.

## API

| Method | Path       | Description                                  |
|--------|------------|----------------------------------------------|
| GET    | `/`        | Web UI                                       |
| GET    | `/health`  | Server and model status                      |
| POST   | `/predict` | Body `{"text": "..."}`, returns emotion + probabilities |

## Deploy on Render

1. Push the project, including the `Artifacts/` folder, to GitHub.
2. In Render choose **New → Blueprint** and select the repo (it reads `render.yaml`). Or create a **Web Service** manually with:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Env var: `PYTHON_VERSION=3.11.9`
3. Render's health check hits `/health`.

Notes:
- Render reads the Python version from the `PYTHON_VERSION` env var or `.python-version`; `runtime.txt` is included for Heroku-style compatibility.
- TensorFlow needs roughly 1 GB of RAM, so the free 512 MB instance will likely run out of memory. Use the Starter plan.
- After running `Emotions_fixed.ipynb`, open `Artifacts/versions.txt` and pin `tensorflow-cpu` to that exact version in `requirements.txt`. A model saved with a newer Keras can fail to load on an older one.
- The first request after Render wakes an idle service can be slow while the model loads.
