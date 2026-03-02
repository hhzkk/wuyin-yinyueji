import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const APP_ID = "cli_a92a969a36785cba";
const APP_SECRET = "ZRPfyM9QEtLcZ74zklzPmfC20aUAoVLZ";

const FEISHU_API = "https://open.feishu.cn/open-apis";

async function getAccessToken(): Promise<string> {
  const resp = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await resp.json();
  return data.tenant_access_token;
}

async function sendMessage(receive_id_type: string, receive_id: string, content: string) {
  const token = await getAccessToken();
  await fetch(`${FEISHU_API}/im/v1/messages?receive_id_type=${receive_id_type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id,
      msg_type: "text",
      content: JSON.stringify({ text: content }),
    }),
  });
}

const mockData: Record<string, any[]> = {
  "林俊杰": [
    { title: "江南 林俊杰 [FLAC]", quark: "https://pan.quark.cn/s/abc123" },
    { title: "不死之身 林俊杰 [FLAC]", quark: "https://pan.quark.cn/s/def456" },
  ],
  "陈雪凝": [
    { title: "绿色 陈雪凝 [FLAC]", quark: "https://pan.quark.cn/s/ghi789" },
  ],
  "周杰伦": [
    { title: "晴天 周杰伦 [FLAC]", quark: "https://pan.quark.cn/s/jkl012" },
    { title: "青花瓷 周杰伦 [WAV]", quark: "https://pan.quark.cn/s/mno345" },
  ],
};

function mockSearch(keyword: string): any[] {
  for (const [key, value] of Object.entries(mockData)) {
    if (keyword.includes(key)) return value;
  }
  return [{ title: `${keyword} [FLAC]`, quark: "https://pan.quark.cn/s/example" }];
}

async function handleMessage(body: any) {
  const event = body.event;
  if (!event || event.type !== "message") return new Response("ok");

  const message = event.message;
  let receiveId = message.sender?.sender_id?.open_id || message.sender?.sender_id?.chat_id || "";
  let receiveIdType = message.sender?.sender_id?.chat_id ? "chat_id" : "open_id";
  
  let textContent = message.body?.content?.text?.trim() || "";
  if (!textContent || !receiveId) return new Response("ok");

  let replyContent = "";

  if (textContent.startsWith("音乐 ") || textContent.startsWith("下载 ")) {
    const keyword = textContent.replace(/^(音乐|Download)\s*/, "").trim();
    const results = mockSearch(keyword);
    replyContent = `🎵 搜索结果: ${keyword}\n\n`;
    results.forEach((r: any, i: number) => {
      replyContent += `${i + 1}. ${r.title}\n🔗 ${r.quark}\n\n`;
    });
  } else if (textContent === "帮助") {
    replyContent = `音乐搜索机器人  命令： • 音乐 <歌名> - 搜索歌曲 • 下载 <歌名> - 下载歌曲  示例： • 音乐 林俊杰 • 音乐 绿色 陈雪凝`;
  } else {
    replyContent = `收到:${textContent}  发送“帮助”查看使用说明 发送“音乐 <歌名>" 搜索歌曲`;
  }

  await sendMessage(receiveIdType, receiveId, replyContent);
  return new Response("ok");
}

serve(async (req) => {
  const url = new URL(req.url);
  
  if (req.method === "GET") {
    const challenge = url.searchParams.get("challenge") || "";
    return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
  }

  如果 (req.method === "POST") {
    尝试 {
      const body = await req.json();
      if (body.type === "url_verification") {
        return new Response(JSON.stringify({ challenge: body.challenge }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (body.type === "event_callback") {
        return await handleMessage(body);
      }
      return new Response("ok");
    } catch (e) {
      return new Response("ok");
    }
  }
  return new Response("Method not allowed", { status: 405 });
});

console.log("🎵 飞书音乐机器人已启动");
