import { decodeBase64 } from "jsr:@std/encoding/base64"

const keyPair = {
    private: await crypto.subtle.importKey(
        "pkcs8",
        decodeBase64(Deno.env.get("PRIVATE_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"],
    ),
    public: await crypto.subtle.importKey(
        "spki",
        decodeBase64(Deno.env.get("PUBLIC_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"],
    ),
}

const textDecoder = new TextDecoder()

const socket = new WebSocket(
    "wss://" +
        Deno.env.get("SERVER_HOST") +
        ":7531/connect?module=channelUtils&events=member_joined_channel,group_left,channel_left,interaction-join-channel&secret=" +
        encodeURIComponent(Deno.env.get("CONNECTION_SECRET")!),
)

socket.addEventListener("open", () => {
    console.log("Socket open")
})

let xoxb = ""
let botUserId = ""

socket.addEventListener("message", async (ev) => {
    const encryptedData = await ev.data.arrayBuffer()
    const data = textDecoder.decode(
        await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            keyPair.private,
            encryptedData,
        ),
    )
    if (data.startsWith("xoxb-")) {
        xoxb = data
        const botData = await (
            await fetch("https://slack.com/api/auth.test", {
                headers: { authorization: "Bearer " + xoxb },
            })
        ).json()
        botUserId = botData.user_id
    }
    if (data.startsWith("event {")) {
        const eventData = JSON.parse(
            data.split("event ").slice(1).join("event "),
        )
        if (eventData.type == "member_joined_channel") {
            if (eventData.user == botUserId) {
                const channelInfo = (
                    await (
                        await fetch(
                            "https://slack.com/api/conversations.info?channel=" +
                                eventData.channel +
                                "&include_num_members=true",
                            { headers: { Authorization: "Bearer " + xoxb } },
                        )
                    ).json()
                ).channel
                const text = `Added to channel <#${eventData.channel}> (${eventData.channel}, ${channelInfo.name}) by <@${eventData.inviter}>`
                await fetch("https://slack.com/api/chat.postMessage", {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + xoxb,
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    body: JSON.stringify({
                        channel: "U091XKGS8SF",
                        text,
                        blocks: [
                            { type: "section", text: { type: "mrkdwn", text } },
                            {
                                type: "actions",
                                elements: [
                                    {
                                        type: "button",
                                        text: {
                                            type: "plain_text",
                                            text: "Join channel",
                                            emoji: true,
                                        },
                                        value: eventData.channel,
                                        action_id: "join-channel",
                                    },
                                ],
                            },
                        ],
                    }),
                })
            }
        } else if (
            eventData.type == "group_left" ||
            eventData.type == "channel_left"
        ) {
            await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + xoxb,
                    "Content-Type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({
                    channel: "U091XKGS8SF",
                    text: `Removed from channel <#${eventData.channel}> (${eventData.channel})${"actor_id" in eventData ? ` by <@${eventData.actor_id}>` : ""}`,
                }),
            })
        } else if (eventData.type == "interaction-join-channel") {
            await fetch("https://slack.com/api/conversations.invite", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + xoxb,
                    "Content-Type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({
                    channel: eventData.action.value,
                    users: "U091XKGS8SF",
                }),
            })
        }
    }
})
