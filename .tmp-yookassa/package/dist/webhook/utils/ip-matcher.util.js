"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIpAllowed = isIpAllowed;
const ipaddr = require("ipaddr.js");
/**
 * Проверяет, входит ли IP-адрес в список разрешённых CIDR / IP.
 *
 * Поддерживает:
 *  - IPv4
 *  - IPv6
 *  - одиночные IP
 *  - CIDR-диапазоны
 */
function isIpAllowed(clientIp, whitelist) {
    if (!clientIp)
        return false;
    try {
        const ip = ipaddr.parse(clientIp);
        return whitelist.some(rule => {
            if (rule.includes('/')) {
                const [range, prefix] = ipaddr.parseCIDR(rule);
                return ip.match(range, prefix);
            }
            return ip.toString() === ipaddr.parse(rule).toString();
        });
    }
    catch (_a) {
        return false;
    }
}
