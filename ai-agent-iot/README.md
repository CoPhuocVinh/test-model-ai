# AI Agent IoT - Phase 1

Mock end-to-end slice for a device AI agent:

```text
API caller -> ai-gateway -> LangGraph/LangChain parser -> MCP HTTP client -> mcp-device-server -> mock device store
```

Everything in this folder is self-contained and does not modify the existing root Ollama compose files.

## Run

```bash
cd ai-agent-iot
docker compose -f docker-compose.agent-phase1.yml up --build
```

Services:

- Ollama: `http://localhost:11434`
- MCP Device Server health: `http://localhost:4001/health`
- AI Gateway health: `http://localhost:4000/health`

`ollama-init` pulls `qwen2.5:1.5b` before `ai-gateway` starts.

Useful parser runtime knobs:

- `LLM_PARSE_TIMEOUT_MS=300000`: max time for one Ollama parse attempt.
- `INTENT_PARSE_MAX_RETRIES=2`: retry count after the first parse attempt.
- `LLM_NUM_PREDICT=220`: caps the JSON response length so Ollama does not keep generating unnecessary tokens.

## Chat Examples

Read multiple devices:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "conversation_id": "demo",
    "message": "Đèn phòng khách đang bật không?"
  }'
```

Write with multiple matches:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "conversation_id": "demo",
    "message": "Bật đèn phòng khách"
  }'
```

Confirm a pending action:

```bash
curl http://localhost:4000/device-actions/confirm \
  -H 'content-type: application/json' \
  -d '{
    "conversation_id": "demo",
    "pending_action_id": "<id from previous response>",
    "device_id": "light_living_ceiling"
  }'
```

Multi-turn relative value:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "conversation_id": "ac-demo",
    "message": "Máy lạnh phòng ngủ đang bao nhiêu độ?"
  }'

curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "conversation_id": "ac-demo",
    "message": "Tăng lên 2 độ đi"
  }'
```

## Local Development

Install and test each service independently:

```bash
cd mcp-device-server
npm install
npm test
npm run build

cd ../ai-gateway
npm install
npm test
npm run build
```

## Phase 1 Limits

- Uses mock device data only.
- Uses in-memory conversation and pending action stores.
- No authentication or authorization.
- Relative commands are supported for numeric properties only.
