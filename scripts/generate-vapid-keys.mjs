import { createECDH } from "node:crypto";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const keys = createECDH("prime256v1");
const publicKey = keys.generateKeys();
const privateKey = keys.getPrivateKey();

console.log("WEB_PUSH_VAPID_PUBLIC_KEY=" + base64Url(publicKey));
console.log("WEB_PUSH_VAPID_PRIVATE_KEY=" + base64Url(privateKey));
