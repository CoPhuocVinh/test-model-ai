# Ollama IoT Model Compose

Repo nay co 4 file Docker Compose:

- `docker-compose.yml`: file mac dinh, giong `docker-compose.qwen25-15b.yml`.
- `docker-compose.qwen25-15b.yml`: chay model goc `qwen2.5:1.5b`.
- `docker-compose.iot-qwen.yml`: tao va chay model custom `iot-qwen:1.5b` dua tren `qwen2.5:1.5b`.
- `docker-compose.all-models.yml`: chay bo test day du `qwen2.5:1.5b`, `qwen2.5:3b`, `gemma2:2b`, va `iot-qwen:1.5b`.

Tat ca file Compose deu dung Ollama lam model server va Open WebUI lam giao dien chat.

## File `docker-compose.yml`

Day la file mac dinh khi chay:

```bash
docker compose up -d
```

No duoc cau hinh giong file `docker-compose.qwen25-15b.yml`, tuc la chi chay model goc:

```text
qwen2.5:1.5b
```

Dung file nay khi muon len nhanh stack nhe nhat ma khong can chi dinh `-f`.

## File `docker-compose.qwen25-15b.yml`

File nay dung khi muon chay truc tiep model goc:

```text
qwen2.5:1.5b
```

Phu hop de test model goc, benchmark toc do, hoac dung cho cac tac vu text/JSON don gian chua can nhung prompt IoT rieng.

### Services

#### `ollama`

Chay Ollama server.

```yaml
image: ollama/ollama:latest
container_name: ollama-qwen25-15b
ports:
  - "11434:11434"
volumes:
  - ollama_data:/root/.ollama
```

Y nghia:

- Mo Ollama API tai `http://localhost:11434`.
- Luu model vao volume `ollama_data`.
- Neu container restart thi model da pull khong bi mat.

Healthcheck:

```yaml
healthcheck:
  test: ["CMD", "ollama", "list"]
```

Compose se doi Ollama san sang truoc khi chay service pull model.

#### `pull-qwen25-15b`

Job chay mot lan de tai model.

```yaml
command: ["pull", "qwen2.5:1.5b"]
```

Sau khi pull xong, container nay dung voi status `Exited (0)`. Day la trang thai binh thuong.

#### `open-webui`

Chay Open WebUI.

```yaml
ports:
  - "3000:8080"
environment:
  - OLLAMA_BASE_URL=http://ollama:11434
```

Y nghia:

- Truy cap UI tai `http://localhost:3000`.
- Open WebUI goi Ollama qua network noi bo Docker bang `http://ollama:11434`.
- Service nay chi start sau khi Ollama healthy va model `qwen2.5:1.5b` pull xong.

### Cach chay

```bash
docker compose -f docker-compose.qwen25-15b.yml up -d
```

### Khi nao dung file nay

Dung file nay khi:

- Muon chay model goc `qwen2.5:1.5b`.
- Muon so sanh chat/output voi model custom.
- Muon uu tien cau hinh gon nhe nhat.

## File `docker-compose.iot-qwen.yml`

File nay dung khi muon chay model custom:

```text
iot-qwen:1.5b
```

Model nay duoc tao tu `qwen2.5:1.5b`, nhung duoc nhung san system prompt va rule cho bai toan IoT.

### Services

#### `ollama`

Chay Ollama server cho model custom.

```yaml
container_name: ollama-iot-qwen
ports:
  - "11434:11434"
volumes:
  - ollama_data:/root/.ollama
```

Tuong tu file qwen goc:

- API tai `http://localhost:11434`.
- Model luu trong `ollama_data`.
- Co healthcheck bang `ollama list`.

#### `pull-qwen25-15b`

Tai model nen:

```text
qwen2.5:1.5b
```

Model custom `iot-qwen:1.5b` can model nen nay de tao bang `ollama create`.

#### `create-iot-qwen`

Day la job tao model custom.

Service nay tao tam file `/tmp/Modelfile` trong container, sau do chay:

```bash
ollama create iot-qwen:1.5b -f /tmp/Modelfile
```

No nhung cac parameter:

```text
temperature = 0
num_ctx = 2048
repeat_penalty = 1.1
```

Phan system prompt yeu cau model:

- Dong vai tro IoT monitoring assistant.
- Phan tich telemetry thiet bi IoT.
- Phat hien trang thai bat thuong.
- Chi tra ve JSON hop le.
- Khong tra markdown.
- Khong giai thich ben ngoai JSON.

Rule dang duoc nhung:

```text
temperature > 80 => critical
temperature > 70 => warning
temperature <= 70 => normal unless another rule triggers
battery < 15 => warning
offline_minutes > 5 => critical
signal_rssi < -85 => warning
missing required telemetry => unknown
```

Schema output:

```json
{
  "device_id": "string",
  "status": "normal|warning|critical|unknown",
  "severity": 0,
  "summary": "string",
  "alerts": [
    {
      "code": "string",
      "message": "string",
      "confidence": 0.0
    }
  ],
  "recommended_action": "string",
  "needs_human": false
}
```

Sau khi tao xong, container `ollama-create-iot-qwen` dung voi status `Exited (0)`. Day la dung hanh vi vi no chi la init job.

#### `open-webui`

Chay Open WebUI cho model custom.

```yaml
container_name: open-webui-iot-qwen
ports:
  - "3000:8080"
```

Service nay chi start sau khi:

- Ollama healthy.
- `iot-qwen:1.5b` tao thanh cong.

### Cach chay

```bash
docker compose -f docker-compose.iot-qwen.yml up -d
```

### Khi nao dung file nay

Dung file nay khi:

- Muon model mac dinh co hanh vi rieng cho IoT.
- Muon model uu tien JSON output.
- Muon dong goi rule canh bao vao model alias `iot-qwen:1.5b`.
- Muon deploy cho workflow monitoring/canh bao thay vi chat tong quat.

## Luong khoi dong

### Qwen goc

```text
ollama
  -> pull qwen2.5:1.5b
  -> open-webui
```

### IoT Qwen custom

```text
ollama
  -> pull qwen2.5:1.5b
  -> create iot-qwen:1.5b
  -> open-webui
```

## Chi chay mot file tai mot thoi diem

Hai file deu dung chung port:

```text
11434
3000
```

Vi vay khong nen chay dong thoi hai compose file.

Khi muon doi tu file nay sang file khac:

```bash
docker compose -f docker-compose.qwen25-15b.yml down --remove-orphans
docker compose -f docker-compose.iot-qwen.yml up -d
```

Hoac nguoc lai:

```bash
docker compose -f docker-compose.iot-qwen.yml down --remove-orphans
docker compose -f docker-compose.qwen25-15b.yml up -d
```

## Kiem tra trang thai

Kiem tra container:

```bash
docker compose -f docker-compose.iot-qwen.yml ps -a
```

Kiem tra model trong Ollama:

```bash
docker exec -it ollama-iot-qwen ollama list
```

Neu dang chay file qwen goc:

```bash
docker exec -it ollama-qwen25-15b ollama list
```

## Test nhanh API

Test model custom:

```bash
curl http://localhost:11434/api/generate \
  -d '{
    "model": "iot-qwen:1.5b",
    "prompt": "{\"device_id\":\"pump_01\",\"temperature\":76,\"battery\":44,\"offline_minutes\":0,\"signal_rssi\":-72}",
    "stream": false,
    "format": "json"
  }'
```

Ky vong output la JSON canh bao `warning` vi temperature lon hon 70.

## Luu y production

Mac dinh port dang expose ra host:

```yaml
ports:
  - "11434:11434"
  - "3000:8080"
```

Neu chay tren VPS public internet, nen bind localhost hoac chan firewall:

```yaml
ports:
  - "127.0.0.1:11434:11434"
  - "127.0.0.1:3000:8080"
```

Voi CPU-only, nen uu tien:

- `iot-qwen:1.5b` cho workflow IoT can toc do.
- `num_ctx: 2048` de giam RAM va tang toc.
- `temperature: 0` de output JSON on dinh hon.

Khong nen de LLM quyet dinh toan bo canh bao quan trong. Nen ket hop:

```text
rule engine trong code
+ telemetry validation
+ LLM de tom tat, phan loai, va goi y hanh dong
```
