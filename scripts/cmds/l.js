const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const chatHistoryDir = 'groqllama70b';
const apiKey = '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';

const groq = new Groq({ apiKey });

const systemPrompt = "Examine the prompt and respond precisely as directed, omitting superfluous information. Provide brief responses, typically 1-2 sentences, except when detailed answers like essays, poems, or stories are requested."; //change if needed

module.exports = {
    config: {
        name: 'l',
        version: '1.1.11',
        author: 'Shikaki',
        countDown: 0,
        role: 0,
        category: 'Ai',
        description: {
            en: 'Use it if you want very fast answers. (Uses Llama3 70b hosted on groq)',
        },
        guide: {
            en: '{pn} [question]\n\nReply clear to clear the chat history.\nOr, use:\n\n{pn} clear',
        },
    },
    onStart: async function ({ api, message, event, args, commandName }) {
        var prompt = args.join(" ");

        let chatHistory = [];

        if (prompt.toLowerCase() === "clear") {
            clearChatHistory(event.senderID);
            message.reply("Chat history cleared!");
            return;
        }

        var content = (event.type == "message_reply") ? event.messageReply.body : args.join(" ");

        if (event.type == "message_reply") {
            content = content + " " + prompt;
            clearChatHistory(event.senderID);

            api.setMessageReaction("⌛", event.messageID, () => { }, true);

            const startTime = Date.now();

            try {
                clearChatHistory(event.senderID);

                const chatMessages = [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": content }
                ];

                const chatCompletion = await groq.chat.completions.create({
                    "messages": chatMessages,
                    "model": "llama3-70b-8192",
                    "temperature": 0.6,
                    "max_tokens": 8192,
                    "top_p": 0.8,
                    "stream": false,
                    "stop": null
                });

                const assistantResponse = chatCompletion.choices[0].message.content;

                const endTime = new Date().getTime();
                const completionTime = ((endTime - startTime) / 1000).toFixed(2);
                const totalWords = assistantResponse.split(/\s+/).filter(word => word !== '').length;

                let finalMessage = `${assistantResponse}\n\nCompletion time: ${completionTime} seconds\nTotal words: ${totalWords}`;

                message.reply(finalMessage, (err, info) => {
                    if (!err) {
                        global.GoatBot.onReply.set(info.messageID, {
                            commandName,
                            messageID: info.messageID,
                            author: event.senderID,
                        });
                    } else {
                        console.error("Error sending message:", err);
                    }
                });

                chatHistory.push({ role: "user", content: prompt });
                chatHistory.push({ role: "assistant", content: assistantResponse });
                appendToChatHistory(event.senderID, chatHistory);

                api.setMessageReaction("✅", event.messageID, () => { }, true);
            } catch (error) {
                console.error("Error in chat completion:", error);
                api.setMessageReaction("❌", event.messageID, () => { }, true);
                return message.reply(`An error occured.`);
            }
        }
        else {
            clearChatHistory(event.senderID);

            if (args.length == 0 && prompt == "") {
                message.reply("Please provide a prompt.");
                return;
            }

            api.setMessageReaction("⌛", event.messageID, () => { }, true);

            const startTime = Date.now();

            try {
                clearChatHistory(event.senderID);

                const chatMessages = [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": prompt }
                ];

                const chatCompletion = await groq.chat.completions.create({
                    "messages": chatMessages,
                    "model": "llama3-70b-8192",
                    "temperature": 0.6,
                    "max_tokens": 8192,
                    "top_p": 0.8,
                    "stream": false,
                    "stop": null
                });

                const assistantResponse = chatCompletion.choices[0].message.content;

                const endTime = new Date().getTime();
                const completionTime = ((endTime - startTime) / 1000).toFixed(2);
                const totalWords = assistantResponse.split(/\s+/).fil
