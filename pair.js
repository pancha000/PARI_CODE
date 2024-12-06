const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");

function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    async function PrabathPair() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        try {
            let DataMateSessionGenarator = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!DataMateSessionGenarator.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await DataMateSessionGenarator.requestPairingCode(num);
                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            DataMateSessionGenarator.ev.on('creds.update', saveCreds);
            DataMateSessionGenarator.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;
                if (connection === "open") {
                    try {
                        await delay(10000);
                        const authPath = './session/creds.json';
                        const userJid = jidNormalizedUser(DataMateSessionGenarator.user.id);

                        if (fs.existsSync(authPath)) {
                            // Send the creds.json file first
                            const credsMessage = await DataMateSessionGenarator.sendMessage(userJid, {
                                document: { url: authPath },
                                mimetype: "application/json",
                                fileName: "creds.json",
                            });

                            // Send follow-up message
                            await DataMateSessionGenarator.sendMessage(userJid, {
                                text: "Don't send this file to anyone. Upload this file to `auth_info_baileys` in your bot repository.",
                                contextInfo: { quotedMessage: credsMessage.message }, // Reply to creds.json
                            });
                        }
                    } catch (e) {
                        exec('pm2 restart prabath');
                    }

                    await delay(100);
                    removeFile('./session');
                    process.exit(0);
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    await delay(10000);
                    PrabathPair();
                }
            });
        } catch (err) {
            exec('pm2 restart prabath-md');
            console.log("Service restarted");
            PrabathPair();
            removeFile('./session');
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" });
            }
        }
    }
    return await PrabathPair();
});

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
    exec('pm2 restart prabath');
});

module.exports = router;
