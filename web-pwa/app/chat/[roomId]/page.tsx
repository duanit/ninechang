"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Hammer, ImagePlus, RefreshCw, Send, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { api, apiAssetUrl, apiFormData, getStoredUser, markChatRead } from "@/lib/api";
import { API_URL, getToken } from "@/lib/api";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = {
  id: string;
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
  sender: { id: string; displayName: string };
};

export default function Chat() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const currentUser = getStoredUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const nextMessages = await api<Message[]>(
        `/api/chat/rooms/${roomId}/messages`,
      );
      setMessages(nextMessages);
      const latestIncoming = nextMessages[nextMessages.length - 1];
      if (latestIncoming) markChatRead(roomId, new Date(latestIncoming.createdAt).getTime());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดข้อความไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMessages(), 0);
    const timer = window.setInterval(() => void loadMessages(), 3000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadMessages]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(API_URL, { auth: { token } });
    socket.emit("room:join", roomId);
    socket.on("message:new", (message: Message) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      markChatRead(roomId, new Date(message.createdAt).getTime());
    });
    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearSelectedImage(input?: HTMLInputElement) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview("");
    if (input) input.value = "";
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    const image = data.get("image");
    if (!body && (!(image instanceof File) || image.size === 0) || sending) return;

    setSending(true);
    setError("");
    try {
      await apiFormData<Message>(`/api/chat/rooms/${roomId}/messages`, data);
      form.reset();
      setImagePreview("");
      await loadMessages();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="ย้อนกลับ">
            <ArrowLeft size={20} />
          </Button>
          <span className="grid size-9 place-items-center rounded-xl bg-[#ff6b2c] text-white">
            <Hammer size={18} />
          </span>
          <div>
            <h1 className="font-black">แชตเรื่องงาน</h1>
            <p className="text-xs text-slate-500">ห้องสนทนาสำหรับพูดคุยรายละเอียดงาน</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => void loadMessages()}
            aria-label="โหลดข้อความใหม่"
          >
            <RefreshCw size={18} />
          </Button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
          {loading && <p className="py-8 text-center text-sm text-slate-500">กำลังโหลดข้อความ...</p>}
          {!loading && messages.length === 0 && (
            <div className="grid min-h-48 place-items-center text-center text-slate-500">
              <div>
                <p className="font-bold">ยังไม่มีข้อความ</p>
                <p className="mt-1 text-sm">เริ่มพูดคุยรายละเอียดงานได้เลย</p>
              </div>
            </div>
          )}
          {messages.map((message) => {
            const isMine = message.sender.id === currentUser?.id;
            return (
              <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${isMine ? "rounded-br-sm bg-[#ff6b2c] text-white" : "rounded-bl-sm bg-slate-100 text-slate-900"}`}>
                  {!isMine && <p className="mb-1 text-xs font-bold opacity-70">{message.sender.displayName}</p>}
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  {message.attachmentUrl && <a href={apiAssetUrl(message.attachmentUrl)} target="_blank" rel="noreferrer"><img src={apiAssetUrl(message.attachmentUrl)} alt="รูปหน้างาน" className="mt-2 max-h-72 rounded-xl object-cover" /></a>}
                  <time className="mt-1 block text-right text-[10px] opacity-65">
                    {new Date(message.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {imagePreview && (
          <div className="relative mt-3 w-fit rounded-xl border bg-white p-2 shadow-sm">
            <img src={imagePreview} alt="ตัวอย่างรูปหน้างาน" className="max-h-40 max-w-xs rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => clearSelectedImage(document.querySelector<HTMLInputElement>('input[name="image"]') ?? undefined)}
              className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-slate-900 text-white"
              aria-label="ลบรูปที่เลือก"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <form onSubmit={send} className="mt-3 flex gap-2">
          <label className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-md border bg-white text-slate-500 hover:text-[#ff6b2c]" title="แนบรูปหน้างาน">
            <ImagePlus size={19} />
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={sending} onChange={selectImage} />
          </label>
          <Input name="body" maxLength={2000} autoComplete="off" placeholder="พิมพ์ข้อความหรือแนบรูป..." disabled={sending} className="h-12 bg-white" />
          <Button type="submit" disabled={sending} className="h-12 bg-[#ff6b2c] px-5">
            <Send size={17} /> {sending ? "กำลังส่ง..." : "ส่ง"}
          </Button>
        </form>
      </section>
    </main>
  );
}
