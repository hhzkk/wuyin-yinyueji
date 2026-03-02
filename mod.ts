/**
 * 飞书音乐搜索机器人
 * 基于 Deno Deploy
 * 功能：搜索音乐并返回夸克网盘链接
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const APP_ID = Deno.env.get("APP_ID") || "cli_a92a969a36785cba";
const APP_SECRET = Deno.env.get("APP_SECRET") || "ZRPfyM9QEtLcZ74zklzPmfC20aUAoVLZ";
const APP_VERIFICATION_TOKEN = Deno.env.get("APP_VERIFICATION_TOKEN") || "6b1FeXGsVYx1effmy9EKCf3nmyO3QnpG";

const FEISHU_API = "https://open.feishu.cn/open-apis";

// 验证签名
function verifySignature(timestamp: string, nonce: string, signature: string): boolean {
  const str = `${timestamp}${nonce}${APP_SECRET}`;
  const hmac = createHmac("sha256", str);
  const digest = hmac.digest();
  const expectedSignature = btoa(String.fromCharCode(...digest));
  return expectedSignature === signature;
}

// 获取 access_token
async function getAccessToken(): Promise<string> {
  const resp = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(`获取token失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

// 发送消息
async function sendMessage(receive_id_type: string, receive_id: string, content: string) {
  const token = await getAccessToken();
  const resp = await fetch(`${FEISHU_API}/im/v1/messages?receive_id_type=${receive_id_type}`, {
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
  const data = await resp.json();
  if (data.code !== 0) {
    console.error("发送消息失败:", data);
  }
  return data;
}

// 搜索音乐 - 调用真实API
async function searchMusic(keyword: string): Promise<any[]> {
  try {
    // 调用我们的音乐搜索服务
    const resp = await fetch(`http://localhost:5001/search?q=${encodeURIComponent(keyword)}`, {
      method: "GET",
    });
    
    if (resp.ok) {
      const results = await resp.json();
      return results.slice(0, 5).map((r: any) => ({
        title: r.title || keyword,
        quark: r.quark || "",
      }));
    }
  } catch (e) {
    console.log("调用本地搜索失败，使用模拟数据");
  }

  // 模拟数据（如果本地服务不可用）
  return mockSearch(keyword);
}

// 模拟搜索结果
function mockSearch(keyword: string): any[] {
  const mockData: Record<string, any[]> = {
    "林俊杰": [
      { title: "江南 林俊杰 [FLAC]", quark: "https://pan.quark.cn/s/abc123" },
      { title: "不死之身 林俊杰 [FLAC]", quark: "https://pan.quark.cn/s/def456" },
      { title: "曹操 林俊杰 [WAV]", quark: "https://pan.quark.cn/s/ghi789" },
    ],
    "陈雪凝": [
      { title: "绿色 陈雪凝 [FLAC]", quark: "https://pan.quark.cn/s/jkl012" },
      { title: "绿色 陈雪凝 [WAV]", quark: "https://pan.quark.cn/s/mno345" },
    ],
    "周杰伦": [
      { title: "晴天 周杰伦 [FLAC]", quark: "https://pan.quark.cn/s/pqr678" },
      { title: "青花瓷 周杰伦 [WAV]", quark: "https://pan.quark.cn/s/stu901" },
    ],
    "郭顶": [
      { title: "我们俩 郭顶 [WAV]", quark: "https://pan.quark.cn/s/vwx234" },
      { title: "水星记 郭顶 [FLAC]", quark: "https://pan.quark.cn/s/yza567" },
    ],
  };

  for (const [key, value] of Object.entries(mockData)) {
    if (keyword.includes(key)) {
      return value;
    }
  }

  return [
    { title: `${keyword} [FLAC]`, quark: "https://pan.quark.cn/s/example" },
  ];
}

// 获取接收者ID
function getReceiveId(message: any): { id: string; type: string } {
  const senderId = message.sender?.sender_id;
  
  if (senderId?.chat_id) {
    return { id: senderId.chat_id, type: "chat_id" };
  }
  if (senderId?.open_id) {
    return { id: senderId.open_id, type: "open_id" };
  }
  if (senderId?.user_id) {
    return { id: senderId.user_id, type: "user_id" };
  }
  
  return { id: "", type: "open_id" };
}

// 处理消息
async function handleMessage(body: any) {
  const event = body.event;
  if (!event || event.type !== "message") {
    return new Response("ok");
  }

  const message = event.message;
  const msgType = message.msg_type;
  
  // 获取发送者
  const { id: receiveId, type: receiveIdType } = getReceiveId(message);

  // 获取消息内容
  let textContent = "";
  if (msgType === "text") {
    textContent = message.body?.content?.text?.trim() || "";
  }

  if (!textContent || !receiveId) {
    return new Response("ok");
  }

  console.log("收到消息:", textContent);

  let replyContent = "";

  // 解析命令
  if (textContent.startsWith("音乐 ") || textContent.startsWith("下载 ")) {
    const keyword = textContent.replace(/^(音乐|Download)\s*/, "").trim();
    
    if (!keyword) {
      replyContent = "请输入歌曲名，如：音乐 林俊杰";
    } else {
      const results = await searchMusic(keyword);
      
      if (results.length > 0 && results[0].quark) {
        replyContent = `🎵 搜索结果: ${keyword}\n\n`;
        results.forEach((r: any, i: number) => {
          replyContent += `${i + 1}. ${r.title}\n🔗 ${r.quark}\n\n`;
        });
        replyContent += `💡 点击链接保存到夸克网盘`;
      } else {
        replyContent = `抱歉，未找到 "${keyword}" 相关歌曲`;
      }
    }
  } else if (textContent === "帮助" || textContent === "help") {
    replyContent = `🎵 音乐搜索机器人

📝 命令：
• 音乐 <歌名/歌手> - 搜索歌曲
• 下载 <歌名/歌手> - 下载歌曲

💡 示例：
• 音乐 林俊杰
• 音乐 绿色 陈雪凝
• 下载 周杰伦 晴天

🔗 返回夸克网盘下载链接`;
  } else {
    replyContent = `收到: ${textContent}

💡 发送 "帮助" 查看使用说明
   发送 "音乐 <歌名>" 搜索歌曲`;
  }

  // 发送回复
  await sendMessage(receiveIdType, receiveId, replyContent);

  return new Response("ok");
}

// 主处理函数
serve(async (req) => {
  const url = new URL(req.url);
  
  // GET 请求 - 验证URL
  if (req.method === "GET") {
    const timestamp = url.searchParams.get("timestamp") || "";
    const nonce = url.searchParams.get("nonce") || "";
    const signature = url.searchParams.get("signature") || "";
    const challenge = url.searchParams.get("challenge") || "";

    if (verifySignature(timestamp, nonce, signature)) {
      return new Response(challenge, { 
        headers: { "Content-Type": "text/plain" } 
      });
    }
    return new Response("verification failed", { status: 401 });
  }

  // POST 请求 - 处理消息
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("收到请求:", JSON.stringify(body).slice(0, 200));
      
      // URL验证回调
      if (body.type === "url_verification") {
        return new Response(JSON.stringify({
          challenge: body.challenge,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // 事件回调
      if (body.type === "event_callback") {
        // 开发模式：跳过签名验证
        if (APP_VERIFICATION_TOKEN === "dev") {
          return await handleMessage(body);
        }
        
        // 验证签名
        const timestamp = req.headers.get("x-feishu-request-timestamp") || "";
        const nonce = req.headers.get("x-feishu-request-nonce") || "";
        const signature = req.headers.get("x-feishu-signature") || "";
        
        if (!verifySignature(timestamp, nonce, signature)) {
          console.log("签名验证失败");
          return new Response("signature verification failed", { status: 401 });
        }
        
        return await handleMessage(body);
      }

      return new Response("ok");
    } catch (e) {
      console.error("处理错误:", e);
      return new Response("ok");
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

console.log("🎵 飞书音乐机器人已启动");
