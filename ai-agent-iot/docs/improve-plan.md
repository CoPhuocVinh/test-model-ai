# Plan: Giảm Hard-Code Trong `ai-agent-iot` Cho Flow Gọi LLM

## Summary
Chuẩn hóa flow gọi LLM của `ai-gateway` theo hướng vẫn giữ Ollama và behavior hiện tại, nhưng bỏ các hard-code gây lệch cấu hình hoặc khó mở rộng. Đợt này không đổi public API HTTP, không đổi flow MCP/device policy, và không refactor lớn parser. Trọng tâm là:
- sửa các bug cấu hình hiện không có hiệu lực,
- gom toàn bộ runtime knobs của LLM/parser về config/env,
- tách prompt/examples ra file riêng để dễ chỉnh mà không phải sửa logic code,
- giảm duplicate giữa compose, config, và parser code.

## Key Changes
- Đồng bộ toàn bộ ngưỡng và tham số parser qua `config`.
  - Thay so sánh cứng `0.65` trong graph bằng `config.intentConfidenceThreshold`.
  - Thêm config riêng cho `repairSearchDevicesIntent` thay vì hard-code `numPredict: 80`.
  - Giữ `temperature: 0` và `format: "json"` làm default của parser, nhưng đưa thành config có thể override qua env để đổi runtime mà không sửa code.
- Giảm duplicate model/runtime trong flow Ollama.
  - Giữ `OLLAMA_MODEL` là nguồn sự thật cho `ai-gateway`.
  - Giữ compose pull cùng model đó, và cập nhật README để nêu rõ khi đổi model phải đổi biến env tương ứng trong compose.
  - Không thêm abstraction đa provider; scope vẫn là Ollama-only.
- Tách prompt parser ra file riêng trong `ai-gateway`.
  - Di chuyển `systemPrompt` và `searchRepairPrompt` khỏi `intentParser.chain.ts` sang file prompt text/module riêng.
  - `intentParser.chain.ts` chỉ còn load prompt, build request, parse JSON, validate schema, retry/timeout/fallback.
  - Prompt file vẫn là tiếng Việt và giữ nguyên semantics hiện tại để tránh regression behavior.
- Giảm hard-code parser policy ở mức vừa phải, không refactor sâu.
  - Giữ heuristic fallback trong code, nhưng gom các keyword list lớn và các default numeric knobs vào constants/config thay vì rải rác inline.
  - Không biến toàn bộ vocabulary thành JSON config trong đợt này; chỉ chuẩn hóa các chỗ đang duplicate hoặc khó đổi.
- Dọn inconsistencies trong intent handling.
  - Rà lại tập intent dùng trong prompt, schema, heuristic và graph để tránh mismatch giữa `unsupported`, `not_device_related`, `clarification_needed`.
  - Chốt một mapping thống nhất: LLM output schema chỉ dùng các intent thật sự được backend xử lý; graph/policy không kiểm tra các giá trị ngoài contract đó.
- Tài liệu hóa runtime knobs cần chỉnh.
  - README của `ai-agent-iot` cần bổ sung bảng env/ý nghĩa cho: model, base URL, timeout, retries, confidence threshold, numPredict parse chính, numPredict repair, và prompt location nếu có.

## Public Interfaces / Config Changes
- Không đổi API HTTP hiện tại:
  - `POST /chat`
  - `POST /device-actions/confirm`
  - `GET /health`
- Mở rộng env config cho `ai-gateway`:
  - dùng `INTENT_CONFIDENCE_THRESHOLD` thật sự trong runtime,
  - thêm env cho parser generation knobs còn đang hard-code, tối thiểu gồm repair `numPredict`,
  - nếu cần, thêm env tham chiếu file prompt hoặc giữ đường dẫn prompt cố định trong codebase.
- Không đổi shape response hiện có.

## Test Plan
- Unit test parser/config:
  - xác nhận graph dùng `config.intentConfidenceThreshold`, không còn literal `0.65`,
  - xác nhận `parseIntent` và `repairSearchDevicesIntent` cùng lấy model/baseUrl/timeout/retries/numPredict từ config tương ứng,
  - xác nhận load prompt file thành công và parser vẫn parse đúng schema cũ.
- Regression test intent behavior:
  - read prompt tiếng Việt,
  - write absolute value,
  - relative add/subtract với history,
  - list-all devices,
  - filtered search,
  - out-of-scope / harmful prompts.
- Negative test:
  - LLM timeout -> fallback heuristic,
  - JSON lỗi qua nhiều retry -> fallback heuristic,
  - repair flow không đổi intent khi repair output invalid.
- Smoke test tài liệu/runbook:
  - `docker compose -f docker-compose.agent-phase1.yml up --build` vẫn pull đúng model và gateway start bình thường với env defaults.
- Lưu ý hiện tại local tests chưa chạy được nếu chưa `npm install`; khi implement phải cài deps cho cả `ai-gateway` và `mcp-device-server` trước khi chạy `npm test`.

## Assumptions And Defaults
- Scope triển khai là “vừa phải”: sửa bug config + tách prompt/runtime knobs, không redesign parser architecture.
- Mục tiêu là hỗ trợ đổi model/runtime an toàn hơn và mở rộng intent dễ hơn, nhưng vẫn giữ Ollama-only.
- Prompt sẽ được tách thành file riêng; heuristic fallback vẫn nằm trong code.
- Behavior user-facing và HTTP contract hiện tại phải giữ tương thích ngược.
- Không đụng mock device store, MCP tool contract, hay logic xác nhận action ngoài những thay đổi bắt buộc để đồng bộ intent/config.
