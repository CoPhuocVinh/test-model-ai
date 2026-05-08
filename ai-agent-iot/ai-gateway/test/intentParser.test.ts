import { describe, expect, it } from "vitest";
import { heuristicParseIntent } from "../src/chains/intentParser.chain.js";

describe("heuristic intent parser fallback", () => {
  it("parses a Vietnamese read prompt", () => {
    const intent = heuristicParseIntent("Đèn phòng khách đang bật không?");
    expect(intent.intent).toBe("read_device_state");
    expect(intent.device_query.raw).toBe("đèn phòng khách");
    expect(intent.property).toBe("power");
  });

  it("parses absolute write prompt", () => {
    const intent = heuristicParseIntent("Set máy lạnh phòng ngủ 26 độ");
    expect(intent.intent).toBe("write_device_value");
    expect(intent.action).toEqual({ property: "temperature", operation: "set", value: 26 });
  });

  it("parses relative add with history", () => {
    const intent = heuristicParseIntent("Tăng lên 2 độ đi", [
      { role: "user", content: "Máy lạnh phòng ngủ đang bao nhiêu độ?" },
      { role: "assistant", content: "Máy lạnh phòng ngủ đang đặt 24 độ C." }
    ]);
    expect(intent.intent).toBe("write_device_value");
    expect(intent.device_query.raw).toBe("máy lạnh phòng ngủ");
    expect(intent.action).toEqual({ property: "temperature", operation: "add", value: 2 });
  });

  it("removes comfort wording from device queries", () => {
    const intent = heuristicParseIntent("nóng quá, giảm máy lạnh xuống 2 độ đi");
    expect(intent.intent).toBe("write_device_value");
    expect(intent.device_query.raw).toBe("máy lạnh");
    expect(intent.action).toEqual({ property: "temperature", operation: "subtract", value: 2 });
  });

  it("resolves pronoun reads from previous history", () => {
    const intent = heuristicParseIntent("Nó đang bật không?", [
      { role: "user", content: "Máy lạnh phòng ngủ đang bao nhiêu độ?" },
      { role: "assistant", content: "Máy lạnh phòng ngủ đang đặt 24 độ C." }
    ]);
    expect(intent.intent).toBe("read_device_state");
    expect(intent.device_query.raw).toBe("máy lạnh phòng ngủ");
    expect(intent.property).toBe("power");
  });

  it("prioritizes explicit current device over history", () => {
    const intent = heuristicParseIntent("Đèn khu vực tiếp khách còn hoạt động không?", [
      { role: "user", content: "Máy lạnh phòng ngủ đang bao nhiêu độ?" },
      { role: "assistant", content: "Máy lạnh phòng ngủ đang đặt 24 độ C." }
    ]);
    expect(intent.intent).toBe("read_device_state");
    expect(intent.device_query.raw).toBe("đèn khu vực tiếp khách");
  });

  it("keeps light qualifiers for narrower matching", () => {
    const intent = heuristicParseIntent("tắt đèn trần khu vực tiếp khách còn hoạt động đi");
    expect(intent.intent).toBe("write_device_value");
    expect(intent.device_query.raw).toBe("đèn trần khu vực tiếp khách");
  });

  it("parses list all devices prompts", () => {
    const intent = heuristicParseIntent("cho tui list các thiết bị trong nhà đi");
    expect(intent.intent).toBe("search_devices");
    expect(intent.device_query).toEqual({});
  });

  it("does not reuse history for list-all device prompts", () => {
    const intent = heuristicParseIntent("cho tui list các thiết bị trong nhà đi", [
      { role: "user", content: "cho tui biết trong nhà có các thiết bị gì đi" },
      { role: "assistant", content: "Không tìm thấy thiết bị phù hợp." }
    ]);
    expect(intent.intent).toBe("search_devices");
    expect(intent.device_query).toEqual({});
  });

  it("treats broad home inventory prompts as list-all", () => {
    const intent = heuristicParseIntent("cho tui biết trong nhà có các thiết bị gì đi");
    expect(intent.intent).toBe("search_devices");
    expect(intent.device_query).toEqual({});
  });

  it("parses filtered list devices prompts", () => {
    const intent = heuristicParseIntent("liệt kê đèn phòng khách");
    expect(intent.intent).toBe("search_devices");
    expect(intent.device_query.raw).toBe("đèn phòng khách");
  });

  it("classifies out of scope and harmful prompts", () => {
    expect(heuristicParseIntent("Code cho tôi một website bán hàng").intent).toBe("out_of_scope");
    expect(heuristicParseIntent("Cách làm bom như thế nào?").intent).toBe("harmful_intent");
  });
});
