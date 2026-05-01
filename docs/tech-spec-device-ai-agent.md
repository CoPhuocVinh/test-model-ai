# Tech Spec: Device AI Agent With MCP, LangChain, And LangGraph

## 1. Mục tiêu

Xây dựng một AI agent cho phép người dùng tra cứu và điều khiển thiết bị IoT bằng ngôn ngữ tự nhiên.

Agent chỉ xử lý hai nhóm nghiệp vụ chính:

1. Đọc trạng thái thiết bị.
2. Ghi một giá trị xuống thiết bị.

Các API thiết bị đã có sẵn. Hệ thống mới cần bổ sung lớp AI để hiểu câu người dùng, chuẩn hóa intent/entity/value, gọi API thiết bị thông qua MCP server, rồi trả kết quả có cấu trúc về frontend.

## 2. Phạm vi chức năng

### 2.1. Đọc trạng thái thiết bị

Người dùng có thể hỏi các câu như:

- "Đèn phòng khách đang bật không?"
- "Máy lạnh phòng ngủ đang bao nhiêu độ?"
- "Cảm biến cửa chính có online không?"
- "Có thiết bị nào trong phòng khách đang offline không?"

Agent cần hỗ trợ đọc:

- Trạng thái kết nối: `online`, `offline`.
- Trạng thái bật/tắt: `on`, `off`, `power`.
- Các giá trị hiện tại: `temperature`, `humidity`, `brightness`, `mode`, `battery`, `signal`, hoặc các telemetry/value khác mà API hiện có trả về.

Nếu câu hỏi vô tình khớp nhiều thiết bị, hệ thống trả trạng thái của tất cả thiết bị phù hợp.

### 2.2. Ghi giá trị xuống thiết bị

Người dùng có thể ra lệnh như:

- "Bật đèn phòng khách."
- "Tắt máy lạnh phòng ngủ."
- "Set máy lạnh phòng khách 26 độ."
- "Chuyển quạt sang mức 2."

Agent cần:

- Hiểu đây là lệnh ghi.
- Tìm thiết bị phù hợp.
- Chuẩn hóa property/value về format API cần.
- Validate thiết bị có hỗ trợ property đó không.
- Validate value hợp lệ trước khi gọi API ghi.
- Chỉ ghi trực tiếp khi xác định đúng một thiết bị.

Nếu lệnh ghi khớp nhiều thiết bị, hệ thống không tự chọn thiết bị và không ghi ngay. Hệ thống trả danh sách `device_id` cụ thể để frontend cho người dùng chọn.

## 3. Không nằm trong phạm vi bản đầu

Bản đầu không nên làm các chức năng sau, trừ khi có yêu cầu sản phẩm rõ ràng:

- Điều khiển hàng loạt: "tắt tất cả thiết bị".
- Automation phức tạp: "mỗi tối 10 giờ bật đèn".
- Scene/routine: "bật chế độ xem phim".
- Phân tích cảnh báo nâng cao từ telemetry dài hạn.
- Tự học alias thiết bị từ lịch sử người dùng.
- Cho LLM tự quyết định gọi API ghi mà không qua policy.

Các chức năng trên có thể mở rộng sau khi flow đọc/ghi cơ bản ổn định.

## 4. Kiến trúc tổng quan

```text
User
  -> Frontend
  -> AI Gateway / Device Agent
       -> LangGraph workflow
       -> LangChain LLM parser
       -> Policy engine
       -> MCP client
  -> MCP Device Server
  -> Existing Device API
  -> IoT Platform / Devices
```

Vai trò từng thành phần:

- `Frontend`: giao diện chat, render kết quả, xử lý chọn thiết bị khi có nhiều match.
- `AI Gateway / Device Agent`: nhận message, hiểu intent, điều phối workflow, gọi MCP tools, áp policy an toàn.
- `LangChain`: gọi LLM, parse câu người dùng thành JSON có cấu trúc.
- `LangGraph`: quản lý flow nhiều bước, route read/write, lưu pending action, resume sau khi người dùng chọn thiết bị.
- `MCP Device Server`: bọc API thiết bị hiện có thành các tools chuẩn cho agent gọi.
- `Existing Device API`: API nội bộ đã có sẵn để search/read/write device.
- `Ollama`: chạy model local như `qwen2.5`, `gemma`, hoặc model custom `iot-qwen`.

## 5. Lý do dùng MCP

MCP server đóng vai trò tool boundary giữa AI agent và hệ thống thiết bị.

Lợi ích:

- Tách AI khỏi API nội bộ.
- Chuẩn hóa tool schema.
- Dễ validate input/output.
- Dễ thay đổi backend device API mà không sửa agent quá nhiều.
- Giới hạn quyền của AI: agent chỉ có thể gọi những tool được expose.
- Dễ test mock tool trước khi nối API thật.

MCP không thay thế agent. MCP chỉ là lớp expose tools.

## 6. Lý do dùng LangChain và LangGraph

### 6.1. LangChain

LangChain được dùng cho phần tương tác với LLM:

- Gọi model qua Ollama hoặc provider khác.
- Ép output theo schema.
- Parse câu user thành intent/entity/property/value.
- Hỗ trợ message history.
- Có thể stream response về frontend nếu cần.

Trong bài toán này, LangChain nên được dùng chủ yếu để chuyển:

```text
"bật đèn phòng khách"
```

thành:

```json
{
  "intent": "write_device_value",
  "device_query": {
    "name": "đèn",
    "room": "phòng khách"
  },
  "property": "power",
  "value": true,
  "confidence": 0.92
}
```

### 6.2. LangGraph

LangGraph được dùng để quản lý workflow agent như một state machine.

Bài toán này có nhiều nhánh rõ ràng:

```text
parse user message
  -> search devices
  -> if read: get states
  -> if write and one device: validate and set value
  -> if write and multiple devices: return selection request
  -> if selected device is provided: resume pending action
  -> format response
```

LangGraph giúp:

- Tách từng bước thành node rõ ràng.
- Route theo điều kiện.
- Lưu state như `intent`, `matched_devices`, `pending_action`.
- Resume flow sau khi frontend gửi device người dùng đã chọn.
- Dễ test từng node.
- Hạn chế agent loop tự do khó kiểm soát.

## 7. Nguyên tắc thiết kế quan trọng

Không để LLM tự gọi API ghi trực tiếp.

Luồng đúng:

```text
User message
  -> LLM parse structured intent
  -> code validate schema
  -> policy engine quyết định flow
  -> MCP tool call
  -> format response
```

Luồng cần tránh:

```text
User message
  -> LLM tự suy nghĩ
  -> LLM tự gọi set_device_value
```

Với thiết bị thật, quyết định ghi cần được kiểm soát bằng code và policy.

## 8. Các service đề xuất

### 8.1. `mcp-device-server`

Service này expose các MCP tools để agent gọi.

Công nghệ đề xuất:

- Node.js 20+
- TypeScript
- Official MCP TypeScript SDK
- Zod
- HTTP client: `undici` hoặc `axios`
- Docker

Cấu trúc thư mục:

```text
mcp-device-server/
  src/
    server.ts
    config.ts
    tools/
      searchDevices.ts
      getDeviceState.ts
      setDeviceValue.ts
      listDeviceCapabilities.ts
      validateDeviceValue.ts
    services/
      deviceApiClient.ts
    schemas/
      device.ts
      toolResponses.ts
  Dockerfile
  package.json
  tsconfig.json
```

### 8.2. `ai-gateway` hoặc `device-agent`

Service này là agent backend cho frontend gọi.

Công nghệ đề xuất:

- Node.js 20+
- TypeScript
- Fastify hoặc NestJS
- LangChain JS
- LangGraph JS
- Zod
- MCP TypeScript client
- Ollama API
- Redis optional cho session/pending action
- Docker

Cấu trúc thư mục:

```text
ai-gateway/
  src/
    main.ts
    config.ts
    routes/
      chat.route.ts
      confirmAction.route.ts
    agents/
      deviceAgent.graph.ts
    chains/
      intentParser.chain.ts
    mcp/
      deviceMcpClient.ts
    policies/
      readPolicy.ts
      writePolicy.ts
      valuePolicy.ts
    schemas/
      intent.schema.ts
      response.schema.ts
      device.schema.ts
    stores/
      conversationStore.ts
      pendingActionStore.ts
  Dockerfile
  package.json
  tsconfig.json
```

## 9. MCP tools

### 9.1. `search_devices`

Tìm thiết bị theo tên, phòng, loại, hoặc keyword.

Input:

```json
{
  "query": "đèn phòng khách",
  "name": "đèn",
  "room": "phòng khách",
  "type": "light"
}
```

Output:

```json
{
  "devices": [
    {
      "device_id": "light_01",
      "name": "Đèn trần phòng khách",
      "room": "phòng khách",
      "type": "light",
      "online": true
    }
  ]
}
```

### 9.2. `get_device_state`

Lấy trạng thái chi tiết của một thiết bị.

Input:

```json
{
  "device_id": "light_01"
}
```

Output:

```json
{
  "device_id": "light_01",
  "name": "Đèn trần phòng khách",
  "online": true,
  "values": {
    "power": true,
    "brightness": 80
  },
  "updated_at": "2026-05-02T10:15:00+07:00"
}
```

### 9.3. `set_device_value`

Ghi một property/value xuống thiết bị.

Input:

```json
{
  "device_id": "light_01",
  "property": "power",
  "value": true
}
```

Output:

```json
{
  "success": true,
  "device_id": "light_01",
  "property": "power",
  "value": true,
  "request_id": "req_123"
}
```

### 9.4. `list_device_capabilities`

Trả danh sách property mà thiết bị hỗ trợ.

Input:

```json
{
  "device_id": "ac_01"
}
```

Output:

```json
{
  "device_id": "ac_01",
  "capabilities": [
    {
      "property": "power",
      "type": "boolean",
      "writable": true
    },
    {
      "property": "temperature",
      "type": "number",
      "writable": true,
      "min": 16,
      "max": 30,
      "unit": "celsius"
    },
    {
      "property": "mode",
      "type": "enum",
      "writable": true,
      "values": ["cool", "heat", "dry", "fan"]
    }
  ]
}
```

### 9.5. `validate_device_value`

Tool này optional. Có thể validate ở agent bằng capability data, hoặc để MCP server/API validate.

Input:

```json
{
  "device_id": "ac_01",
  "property": "temperature",
  "value": 26
}
```

Output:

```json
{
  "valid": true
}
```

Nếu không hợp lệ:

```json
{
  "valid": false,
  "reason": "temperature must be between 16 and 30 celsius"
}
```

## 10. Intent schema

LLM parser cần trả JSON theo schema ổn định.

```json
{
  "intent": "read_device_state",
  "device_query": {
    "raw": "đèn phòng khách",
    "name": "đèn",
    "room": "phòng khách",
    "type": "light"
  },
  "property": "power",
  "value": null,
  "confidence": 0.9
}
```

Các intent ban đầu:

- `read_device_state`
- `write_device_value`
- `search_devices`
- `confirm_pending_action`
- `not_device_related`
- `clarification_needed`
- `unsupported`

Quy ước:

- `property` có thể `null` nếu người dùng hỏi trạng thái chung.
- `value` chỉ bắt buộc với `write_device_value`.
- `confidence` thấp hơn ngưỡng cấu hình thì hỏi lại hoặc trả `clarification_needed`.

## 11. Response contract cho frontend

Frontend không nên parse câu chữ tự do. Backend cần trả response theo `type`.

Các response type đề xuất:

- `device_read_result`
- `device_write_success`
- `multiple_devices_matched`
- `device_not_found`
- `invalid_value`
- `unsupported_property`
- `device_offline`
- `clarification_needed`
- `not_device_related`
- `error`

### 11.1. Read result

```json
{
  "type": "device_read_result",
  "message": "Tìm thấy 2 đèn trong phòng khách.",
  "devices": [
    {
      "device_id": "light_01",
      "name": "Đèn trần phòng khách",
      "room": "phòng khách",
      "type": "light",
      "online": true,
      "values": {
        "power": true,
        "brightness": 80
      }
    },
    {
      "device_id": "light_02",
      "name": "Đèn led phòng khách",
      "room": "phòng khách",
      "type": "light",
      "online": true,
      "values": {
        "power": false,
        "brightness": 30
      }
    }
  ]
}
```

### 11.2. Write success

```json
{
  "type": "device_write_success",
  "message": "Đã bật Đèn trần phòng khách.",
  "device": {
    "device_id": "light_01",
    "name": "Đèn trần phòng khách"
  },
  "action": {
    "property": "power",
    "value": true
  }
}
```

### 11.3. Multiple devices matched

```json
{
  "type": "multiple_devices_matched",
  "message": "Có nhiều thiết bị phù hợp. Vui lòng chọn thiết bị cần điều khiển.",
  "devices": [
    {
      "device_id": "light_01",
      "name": "Đèn trần phòng khách",
      "room": "phòng khách",
      "type": "light"
    },
    {
      "device_id": "light_02",
      "name": "Đèn led phòng khách",
      "room": "phòng khách",
      "type": "light"
    }
  ],
  "pending_action": {
    "id": "pending_123",
    "property": "power",
    "value": true
  }
}
```

### 11.4. Invalid value

```json
{
  "type": "invalid_value",
  "message": "Giá trị nhiệt độ không hợp lệ. Máy lạnh chỉ hỗ trợ từ 16 đến 30 độ C.",
  "device": {
    "device_id": "ac_01",
    "name": "Máy lạnh phòng khách"
  },
  "action": {
    "property": "temperature",
    "value": 5
  }
}
```

## 12. API của AI Gateway

### 12.1. `POST /chat`

Frontend gửi message người dùng.

Request:

```json
{
  "conversation_id": "conv_123",
  "message": "bật đèn phòng khách"
}
```

Response:

```json
{
  "type": "multiple_devices_matched",
  "message": "Có nhiều thiết bị phù hợp. Vui lòng chọn thiết bị cần điều khiển.",
  "devices": [
    {
      "device_id": "light_01",
      "name": "Đèn trần phòng khách"
    },
    {
      "device_id": "light_02",
      "name": "Đèn led phòng khách"
    }
  ],
  "pending_action": {
    "id": "pending_123",
    "property": "power",
    "value": true
  }
}
```

### 12.2. `POST /device-actions/confirm`

Frontend gọi khi người dùng đã chọn thiết bị cụ thể.

Request:

```json
{
  "conversation_id": "conv_123",
  "pending_action_id": "pending_123",
  "device_id": "light_01"
}
```

Response:

```json
{
  "type": "device_write_success",
  "message": "Đã bật Đèn trần phòng khách.",
  "device": {
    "device_id": "light_01",
    "name": "Đèn trần phòng khách"
  },
  "action": {
    "property": "power",
    "value": true
  }
}
```

## 13. LangGraph state

State tối thiểu:

```ts
type DeviceAgentState = {
  conversationId: string;
  userMessage?: string;
  selectedDeviceId?: string;
  intent?: ParsedIntent;
  matchedDevices?: DeviceSummary[];
  deviceStates?: DeviceState[];
  pendingAction?: PendingAction;
  response?: AgentResponse;
  errors?: AgentError[];
};
```

Các node đề xuất:

- `parseUserMessage`
- `searchDevices`
- `routeByIntent`
- `readDeviceStates`
- `checkWritePolicy`
- `requestDeviceSelection`
- `validateSelectedDevice`
- `setDeviceValue`
- `formatResponse`
- `handleError`

Route chính:

```text
START
  -> parseUserMessage
  -> searchDevices
  -> routeByIntent

routeByIntent:
  read_device_state -> readDeviceStates -> formatResponse -> END
  write_device_value -> checkWritePolicy
  not_device_related -> formatResponse -> END
  clarification_needed -> formatResponse -> END

checkWritePolicy:
  0 devices -> formatResponse -> END
  1 device -> validateSelectedDevice -> setDeviceValue -> formatResponse -> END
  multiple devices -> requestDeviceSelection -> END
```

Confirm route:

```text
START
  -> loadPendingAction
  -> validateSelectedDevice
  -> setDeviceValue
  -> formatResponse
  -> END
```

## 14. Policy rules

### 14.1. Search result policy

- `0 device`: trả `device_not_found`.
- `1 device + read`: đọc trạng thái device đó.
- `many devices + read`: đọc trạng thái tất cả device match.
- `1 device + write`: tiếp tục validate capability/value.
- `many devices + write`: trả `multiple_devices_matched`, không ghi.

### 14.2. Write policy

Trước khi gọi `set_device_value`:

- Thiết bị phải tồn tại.
- Thiết bị phải online nếu API yêu cầu online mới ghi được.
- Thiết bị phải support property.
- Property phải writable.
- Value phải đúng type.
- Value phải nằm trong range hoặc enum cho phép.
- Pending action phải còn hạn nếu flow confirm được resume.

### 14.3. High-risk command policy

Các lệnh sau nên block hoặc yêu cầu confirm ở bản sau:

- Ghi vào nhiều thiết bị cùng lúc.
- Ghi vào toàn bộ phòng.
- Ghi vào toàn bộ nhà.
- Các lệnh có tác động an toàn như khóa cửa, mở cửa, tắt camera, tắt cảnh báo.

Bản đầu nên giới hạn ghi trực tiếp cho đúng một thiết bị match.

## 15. Chuẩn hóa property và value

Agent cần map ngôn ngữ tự nhiên sang property/value chuẩn.

Ví dụ:

```text
"bật" -> property: "power", value: true
"tắt" -> property: "power", value: false
"sáng 80%" -> property: "brightness", value: 80
"26 độ" -> property: "temperature", value: 26
"chế độ lạnh" -> property: "mode", value: "cool"
```

Nên giữ bảng mapping riêng trong code:

```ts
const propertyAliases = {
  power: ["bật", "tắt", "on", "off", "mở"],
  brightness: ["độ sáng", "sáng", "brightness"],
  temperature: ["nhiệt độ", "độ", "temperature"],
  mode: ["chế độ", "mode"],
};
```

LLM có thể gợi ý property/value, nhưng code vẫn cần validate theo capabilities của device.

## 16. Session và pending action

Khi lệnh ghi match nhiều thiết bị, agent trả pending action:

```json
{
  "id": "pending_123",
  "property": "power",
  "value": true,
  "device_candidates": ["light_01", "light_02"],
  "expires_at": "2026-05-02T10:20:00+07:00"
}
```

Frontend chỉ cần gửi lại `pending_action_id` và `device_id` người dùng chọn.

Backend cần kiểm tra:

- Pending action tồn tại.
- Pending action thuộc đúng `conversation_id`.
- Chưa hết hạn.
- `device_id` nằm trong danh sách candidates.
- Value vẫn hợp lệ với thiết bị đã chọn.

Storage:

- Dev/local: in-memory map.
- Production: Redis.

TTL đề xuất: 3 đến 5 phút.

## 17. Docker Compose mục tiêu

Repo hiện tại đã có Ollama và Open WebUI. Khi thêm agent, compose mục tiêu có thể là:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  mcp-device-server:
    build: ./mcp-device-server
    environment:
      - DEVICE_API_BASE_URL=http://host.docker.internal:8080
      - DEVICE_API_TOKEN=${DEVICE_API_TOKEN}
      - PORT=4001
    ports:
      - "4001:4001"

  ai-gateway:
    build: ./ai-gateway
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - OLLAMA_MODEL=qwen2.5:1.5b
      - MCP_DEVICE_SERVER_URL=http://mcp-device-server:4001
      - PORT=4000
    ports:
      - "4000:4000"
    depends_on:
      - ollama
      - mcp-device-server

volumes:
  ollama_data:
```

Open WebUI có thể giữ lại cho việc test model, nhưng frontend sản phẩm nên gọi `ai-gateway` thay vì gọi thẳng Open WebUI.

## 18. Environment variables

### 18.1. `mcp-device-server`

```env
NODE_ENV=development
PORT=4001
MCP_TRANSPORT=http
DEVICE_API_BASE_URL=http://host.docker.internal:8080
DEVICE_API_TOKEN=replace-me
DEVICE_API_TIMEOUT_MS=10000
```

### 18.2. `ai-gateway`

```env
NODE_ENV=development
PORT=4000
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:1.5b
MCP_DEVICE_SERVER_URL=http://mcp-device-server:4001
INTENT_CONFIDENCE_THRESHOLD=0.65
PENDING_ACTION_TTL_SECONDS=300
```

## 19. Error handling

Các lỗi cần chuẩn hóa:

- Device API timeout.
- Device API trả lỗi auth.
- Không tìm thấy thiết bị.
- Thiết bị offline.
- Device capability thiếu hoặc không đọc được.
- Value không hợp lệ.
- LLM trả JSON sai schema.
- MCP tool call lỗi.
- Pending action hết hạn.

Mọi lỗi trả về frontend nên có format:

```json
{
  "type": "error",
  "message": "Không thể lấy trạng thái thiết bị lúc này.",
  "code": "DEVICE_API_TIMEOUT",
  "retryable": true
}
```

## 20. Logging và observability

Log cần có:

- `conversation_id`
- `request_id`
- intent parsed
- matched device count
- tool name được gọi
- device_id khi ghi
- policy decision
- latency của LLM
- latency của MCP/API
- error code nếu có

Không log dữ liệu nhạy cảm:

- API token.
- Credential.
- Secret.
- Payload người dùng nếu có dữ liệu riêng tư nhạy cảm, trừ khi đã được phép.

## 21. Test plan

### 21.1. Unit test

Test các phần:

- Intent schema validation.
- Property/value normalization.
- Write policy.
- Pending action validation.
- Response formatter.

### 21.2. Integration test với mock Device API

Các case bắt buộc:

1. Đọc một thiết bị.
2. Đọc nhiều thiết bị.
3. Ghi một thiết bị.
4. Ghi match nhiều thiết bị.
5. Không tìm thấy thiết bị.
6. Thiết bị offline.
7. Property không hỗ trợ.
8. Value vượt range.
9. Pending action hết hạn.
10. Frontend chọn device không nằm trong candidates.

### 21.3. Manual test script

Các câu test:

```text
Đèn phòng khách đang bật không?
Bật đèn phòng khách.
Tắt đèn led phòng khách.
Máy lạnh phòng ngủ đang bao nhiêu độ?
Set máy lạnh phòng ngủ 26 độ.
Set máy lạnh phòng ngủ 5 độ.
Cảm biến cửa chính có online không?
Bật đèn.
Tắt tất cả thiết bị.
```

## 22. Kế hoạch triển khai

### Phase 1: Mock end-to-end

- Tạo `mcp-device-server`.
- Dùng mock data thay cho Device API thật.
- Tạo tools: `search_devices`, `get_device_state`, `set_device_value`.
- Tạo `ai-gateway`.
- Dùng LangChain parse intent.
- Dùng LangGraph điều phối read/write flow.
- Frontend gọi thử `/chat` và `/device-actions/confirm`.

### Phase 2: Nối Device API thật

- Implement `deviceApiClient`.
- Map response API thật sang schema nội bộ.
- Map set value sang endpoint thật.
- Thêm auth/token.
- Thêm timeout/retry phù hợp.

### Phase 3: Hardening

- Thêm `list_device_capabilities`.
- Thêm validation range/enum.
- Thêm Redis cho pending action.
- Thêm logging/request id.
- Thêm integration tests.

### Phase 4: Product polish

- Cải thiện prompt tiếng Việt.
- Thêm alias room/device.
- Thêm response message tự nhiên hơn.
- Thêm stream nếu frontend cần.
- Thêm confirm cho high-risk command.

## 23. Quyết định kỹ thuật đề xuất

| Hạng mục | Đề xuất |
| --- | --- |
| Agent backend | Node.js + TypeScript |
| HTTP framework | Fastify |
| LLM orchestration | LangChain JS |
| Agent workflow | LangGraph JS |
| Tool protocol | MCP |
| MCP server | Official MCP TypeScript SDK |
| Schema validation | Zod |
| Local model runtime | Ollama |
| Initial model | `qwen2.5:1.5b` hoặc model custom từ repo hiện tại |
| Session store dev | In-memory |
| Session store production | Redis |
| Deployment | Docker Compose |

## 24. Câu hỏi cần xác nhận trước khi implement API thật

1. Device API hiện có endpoint search/read/write cụ thể là gì?
2. Device ID là string nào: `id`, `device_id`, hay field khác?
3. API có trả capabilities của từng device không?
4. API có phân biệt online/offline không?
5. Khi device offline, API set value trả lỗi hay vẫn accept command?
6. Có property chuẩn sẵn chưa, ví dụ `power`, `temperature`, `brightness`, `mode`?
7. Có cần auth theo user/tenant không?
8. Frontend muốn response hoàn toàn structured JSON hay kèm text chat?
9. Có cần lưu lịch sử hội thoại không, hay chỉ xử lý từng câu độc lập?
10. Các lệnh high-risk như khóa cửa, mở cửa, tắt camera có nằm trong scope không?

## 25. Kết luận

Thiết kế phù hợp nhất cho nhu cầu hiện tại là:

```text
LangGraph Device Agent
  + LangChain structured intent parser
  + Policy engine bằng code
  + MCP Device Server
  + Existing Device API
```

LLM chỉ nên xử lý phần hiểu ngôn ngữ và chuẩn hóa ý định. Toàn bộ quyết định quan trọng như có được ghi không, ghi vào thiết bị nào, value có hợp lệ không phải nằm trong code/policy.

Thiết kế này giúp hệ thống dễ test, dễ debug, ít rủi ro ghi nhầm thiết bị và vẫn đủ linh hoạt để mở rộng thêm automation, scene, hoặc cảnh báo trong các phase sau.
