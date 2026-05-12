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

`ollama-init` pulls the same model configured in `OLLAMA_MODEL` before `ai-gateway` starts. The default is `qwen2.5:3b`.

Useful parser runtime knobs:

- `OLLAMA_MODEL=qwen2.5:3b`: source of truth for the model that `ai-gateway` calls and `ollama-init` pulls.
- `OLLAMA_BASE_URL=http://ollama:11434`: Ollama endpoint used by the parser.
- `OLLAMA_FORMAT=json`: Ollama response format requested by the parser.
- `OLLAMA_TEMPERATURE=0`: deterministic parser setting for intent extraction.
- `INTENT_CONFIDENCE_THRESHOLD=0.65`: minimum confidence before the gateway asks for clarification.
- `LLM_PARSE_TIMEOUT_MS=300000`: max time for one Ollama parse attempt.
- `INTENT_PARSE_MAX_RETRIES=2`: retry count after the first parse attempt.
- `LLM_NUM_PREDICT=220`: caps the JSON response length so Ollama does not keep generating unnecessary tokens.
- `LLM_REPAIR_NUM_PREDICT=80`: caps the shorter repair prompt used when broad search intent needs fixing.
- `SEARCH_REPAIR_CONFIDENCE_THRESHOLD=0.6`: minimum repair confidence before broad searches are converted to list-all.
- `MESSAGE_HISTORY_TURNS=5`: number of recent user/assistant turns kept in memory per conversation.
- `PENDING_ACTION_TTL_SECONDS=300`: max lifetime for a pending device-selection action.
- `LOG_LEVEL=info`: gateway structured log level (`debug`, `info`, `warn`, `error`, or `silent`).
- `LOG_USER_MESSAGES=false`: keep raw user messages out of structured logs by default.
- `IOT_API_ENDPOINT=http://iot.dev-api.bmscontrols.vn`: customer IoT base endpoint used by the MCP device adapter. Override this per customer environment.

Device backend adapter:

- Lists all devices with `GET /iot/device-by-mac?$search=`.
- Searches devices by setting `$search` to the requested name or code, then applies local filtering for longer natural-language queries.
- Reads device state and capabilities by searching the backend with the device `code`, then exact-matching that `code`.
- Writes a device value with `PATCH /iot/device-by-mac?id=:code&value=:value`.
- Normalizes aliases, values, and capabilities from each backend device type/input config so non-thermostat devices are not treated as temperature devices.
- Assumes `$search=` returns all devices needed by the current environment. The backend response includes pagination fields (`total`, `limit`, `skip`); add pagination support if customer environments exceed one returned page.

Prompt modules:

- `ai-gateway/src/chains/intentParser.prompts.ts`: main parser prompt and search-repair prompt.
- `ai-gateway/src/chains/intentParser.constants.ts`: keyword lists and heuristic confidence constants.

If you want to change model/runtime behavior, update `OLLAMA_MODEL` and related env values in `docker-compose.agent-phase1.yml` so the pulled model and runtime config stay aligned.

## Chat Examples

Read multiple devices:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "Đèn phòng khách đang bật không?"
  }'
```

Write with multiple matches:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "Bật đèn phòng khách"
  }'
```

Confirm a pending action:

```bash
curl http://localhost:4000/device-actions/confirm \
  -H 'content-type: application/json' \
  -d '{
    "pending_action_id": "<id from previous response>",
    "device_id": "light_living_ceiling"
  }'
```

Multi-turn relative value:

```bash
curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "Máy lạnh phòng ngủ đang bao nhiêu độ?"
  }'

curl http://localhost:4000/chat \
  -H 'content-type: application/json' \
  -d '{
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
