# F1 Strategy Engine — ML serving backend
FROM python:3.12-slim

WORKDIR /app

# deps first (layer cache). Wheels exist for lightgbm/xgboost on 3.12 — no compilers needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app + pre-seeded model store + data
COPY app ./app
COPY scripts ./scripts
COPY data ./data
COPY model_store ./model_store
COPY run.py requirements.txt ./

EXPOSE 8000
CMD ["python", "run.py"]
