# PhoenixQ 🔥  
*A crash-safe, retry-aware asynchronous job processing system*

PhoenixQ is a production-shaped background job system built to deeply understand
how real-world async processing works — beyond CRUD.

It implements delayed jobs, crash recovery, retries with backoff, dead-letter queues,
and idempotent execution using Redis.

---

## ✨ Features

### ✅ Asynchronous Job Processing
- API enqueues jobs and responds immediately
- Workers execute jobs out-of-band

### ⏳ Delayed Jobs (First-Class)
- Jobs are scheduled using Redis Sorted Sets
- Execution time is controlled via timestamps (`availableAt`)

### 💥 Crash Safety (Visibility Timeout)
- Jobs are never lost if a worker crashes mid-execution
- In-progress jobs are re-queued after a visibility timeout

### 🔁 Retries with Exponential Backoff
- Configurable retry attempts
- Increasing delay between retries
- Prevents hot retry loops

### ☠️ Dead Letter Queue (DLQ)
- Jobs that exceed retry limits are moved to a DLQ
- Failures are observable and inspectable
- No silent job loss

### 🔐 Correct Idempotency
- At-least-once execution with exactly-once side effects
- Idempotency is marked **only after successful execution**
- Safe against retries, crashes, and duplicates

### 🧱 Clear Job Lifecycle
- `queued → processing → completed`
- `queued → processing → retrying`
- `queued → processing → dead (DLQ)`

---

## 🏗 Architecture Overview

```
Client
  ↓
API Service
  ↓
Redis (queues:jobs)
  ↓
Worker Service
  ↓
Redis (queues:processing / queues:dlq)
```

### Services
- **API** – Accepts requests and enqueues jobs
- **Worker** – Executes jobs asynchronously
- **Redis** – Queue, state store, and coordination layer

Each service runs in its **own container and process**.

---

## 🧠 Core Concepts Implemented

- At-least-once delivery
- Visibility timeouts
- Exponential backoff
- Dead letter queues
- Idempotent job execution
- Failure-first design

---

## 🚀 Boot Process

### 1️⃣ Start the system
```bash
docker compose up --build
```

This starts:
- Redis
- API service (port 3000)
- Worker service

---

### 2️⃣ Enqueue a job
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email.send",
    "payload": { "to": "test@test.com" }
  }'
```

Response:
```json
{
  "jobId": "<uuid>",
  "status": "queued"
}
```

---

### 3️⃣ Watch the worker execute
Logs will show:
```
[WORKER] Handling job <jobId>, attempt 0
[WORKER] Retrying job <jobId> in 4000ms
[WORKER] Handling job <jobId>, attempt 1
[WORKER] Completed job <jobId>
```

---

## 🧪 Inspect Queues (Redis)

```redis
ZRANGE queues:jobs 0 -1 WITHSCORES
ZRANGE queues:processing 0 -1 WITHSCORES
ZRANGE queues:dlq 0 -1 WITHSCORES
```

Inspect a job:
```redis
GET job:<jobId>
```

---

## ⚠️ Non-Goals (Intentional)

- No UI or admin panel
- No exactly-once guarantee
- No Kafka-level durability
- No premature abstractions

PhoenixQ focuses on **correctness, clarity, and learning**.

---

## 🎯 Why PhoenixQ Exists

This project was built to:
- Understand how Sidekiq / Bull / SQS actually work
- Learn failure-first system design
- Practice senior-level backend reasoning
- Build an interview-grade system, not a demo app

---

## 🧩 Future Extensions
- Observability (metrics, tracing)
- Multi-worker race handling
- Replay from DLQ
- Production tradeoff analysis

---

## 📜 License
MIT
