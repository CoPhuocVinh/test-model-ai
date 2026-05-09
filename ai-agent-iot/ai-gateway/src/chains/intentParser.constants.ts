export const parserFillerTerms = [
  "vui lòng",
  "vui long",
  "liệt kê",
  "liet ke",
  "danh sách",
  "danh sach",
  "xem các thiết bị",
  "xem cac thiet bi",
  "các thiết bị",
  "cac thiet bi",
  "thiết bị",
  "thiet bi",
  "trong nhà",
  "trong nha",
  "biết",
  "biet",
  "có",
  "co",
  "gì",
  "gi",
  "thứ",
  "thu",
  "hoạt động",
  "hoat dong",
  "kết nối",
  "ket noi",
  "bao nhiêu",
  "bao nhieu",
  "trạng thái",
  "trang thai",
  "phần trăm",
  "phan tram",
  "độ",
  "do",
  "cho",
  "tui",
  "tôi",
  "toi",
  "giúp",
  "giup",
  "hãy",
  "hay",
  "đi",
  "di",
  "nhé",
  "nhe",
  "list",
  "xem",
  "tìm",
  "tim",
  "kiếm",
  "kiem",
  "các",
  "cac",
  "những",
  "nhung",
  "đang",
  "dang",
  "còn",
  "con",
  "online",
  "offline",
  "không",
  "khong",
  "bật",
  "bat",
  "mở",
  "mo",
  "tắt",
  "tat",
  "set",
  "đặt",
  "dat",
  "tăng",
  "tang",
  "giảm",
  "giam",
  "lên",
  "len",
  "xuống",
  "xuong",
  "chuyển",
  "chuyen"
];

export const deviceQueryNoisePhrases = [
  "nóng quá",
  "nong qua",
  "hơi nóng",
  "hoi nong",
  "lạnh quá",
  "lanh qua",
  "hơi lạnh",
  "hoi lanh"
];

export const genericInventoryQueries = ["nhà", "nha", "toàn bộ", "toan bo", "tất cả", "tat ca"];

export const deviceCollectionKeywords = [
  "thiết bị",
  "thiet bi",
  "trong nhà",
  "trong nha",
  "các thứ",
  "cac thu",
  "thứ gì",
  "thu gi"
];

export const propertyKeywordGroups = [
  { property: "power", keywords: ["bật", "bat", "mở", "mo", "tắt", "tat"] },
  { property: "online", keywords: ["hoạt động", "hoat dong", "online", "offline", "kết nối", "ket noi"] },
  { property: "temperature", keywords: ["độ", "do", "nhiệt độ", "nhiet do", "tăng", "tang", "giảm", "giam"] },
  { property: "brightness", keywords: ["%", "sáng", "sang", "brightness"] },
  { property: "battery", keywords: ["pin", "battery"] },
  { property: "open", keywords: ["mở cửa", "mo cua", "đóng cửa", "dong cua"] },
  { property: "mode", keywords: ["mode", "chế độ", "che do"] }
] as const;

export const actionKeywordGroups = {
  powerOn: ["bật", "bat", "mở", "mo"],
  powerOff: ["tắt", "tat"],
  add: ["tăng", "tang"],
  subtract: ["giảm", "giam"],
  set: ["set", "đặt", "dat"]
} as const;

export const currentDeviceReferenceTerms = ["cái đó", "cai do", "nó", "no", "thiết bị đó", "thiet bi do"];
export const politeCommandPrefixes = ["cho", "tui", "tôi", "toi", "giúp", "giup", "vui lòng", "vui long", "hãy", "hay"];
export const writeCommandKeywords = ["bật", "bat", "mở", "mo", "tắt", "tat", "set", "đặt", "dat", "tăng", "tang", "giảm", "giam", "chuyển", "chuyen"];
export const deviceListRequestKeywords = ["list", "liệt kê", "liet ke", "danh sách", "danh sach", "xem các thiết bị", "xem cac thiet bi", "các thiết bị", "cac thiet bi", "các thứ", "cac thu", "thứ gì", "thu gi"];
export const readStateKeywords = ["?", "khong", "bao nhiêu", "bao nhieu", "trạng thái", "trang thai", "đang", "dang", "online", "offline", "hoạt động", "hoat dong", "kết nối", "ket noi"];
export const harmfulIntentKeywords = ["bom", "vũ khí"];
export const outOfScopeKeywords = ["code", "website", "bán hàng"];

export const smartHomeKeywords = [
  "đèn",
  "bóng đèn",
  "máy lạnh",
  "điều hòa",
  "điều hoà",
  "cảm biến",
  "thiết bị",
  "thiet bi",
  "trong nhà",
  "trong nha",
  "list",
  "liệt kê",
  "liet ke",
  "danh sách",
  "danh sach",
  "phòng khách",
  "tiếp khách",
  "phòng ngủ",
  "cửa chính",
  "hoạt động",
  "online",
  "offline",
  "kết nối",
  "bật",
  "tắt",
  "mở",
  "set",
  "đặt",
  "tăng",
  "giảm"
];

export const guardedFallbackIntents = ["out_of_scope", "unsupported"] as const;
export const clarificationIntentTypes = ["clarification_needed", "unsupported"] as const;
export const terminalIntentTypes = ["out_of_scope", "harmful_intent"] as const;
export const heuristicConfidence = {
  harmfulIntent: 0.95,
  outOfScope: 0.9,
  searchDevices: 0.9,
  readDeviceState: 0.84,
  writeDeviceValue: 0.84,
  defaultOutOfScope: 0.65
} as const;
