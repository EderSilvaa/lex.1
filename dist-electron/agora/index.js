"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgoraStore = exports.getAgoraStore = void 0;
var agora_store_1 = require("./agora-store");
Object.defineProperty(exports, "getAgoraStore", { enumerable: true, get: function () { return agora_store_1.getAgoraStore; } });
Object.defineProperty(exports, "AgoraStore", { enumerable: true, get: function () { return agora_store_1.AgoraStore; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map