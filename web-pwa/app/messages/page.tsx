"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, getChatReadAt, getStoredUser } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Room = {
  id: string;
  job: {
    title: string;
    status: string;
    customer: { id: string; displayName: string };
    professional?: { id: string; displayName: string } | null;
  };
  messages: { body: string; attachmentUrl?: string | null; createdAt: string; sender: { id: string; displayName: string } }[];
};

export default function MessagesPage() {
  const router = useRouter();
  const user = getStoredUser();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadRooms() {
    try {
      setRooms(await api<Room[]>("/api/chat/rooms"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายการแชตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRooms();
    const timer = window.setInterval(() => void loadRooms(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="ย้อนกลับ"><ArrowLeft size={20} /></Button>
          <MessageCircle className="text-[#ff6b2c]" />
          <h1 className="font-black">ข้อความทั้งหมด</h1>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => void loadRooms()} aria-label="โหลดข้อความใหม่"><RefreshCw size={18} /></Button>
        </div>
      </header>
      <section className="mx-auto max-w-3xl space-y-3 p-4">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading && <p className="rounded-2xl bg-white p-10 text-center text-slate-500">กำลังโหลดข้อความ...</p>}
        {!loading && !error && rooms.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-slate-500">ยังไม่มีห้องแชต</div>}
        {rooms.map((room) => {
          const latest = room.messages[0];
          const other = user?.id === room.job.customer.id ? room.job.professional?.displayName : room.job.customer.displayName;
          const unread = latest && latest.sender.id !== user?.id && new Date(latest.createdAt).getTime() > getChatReadAt(room.id);
          return <a key={room.id} href={`/chat/${room.id}`} className={`block rounded-2xl border bg-white p-5 hover:border-orange-300 ${unread ? "border-orange-300 bg-orange-50/30" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-extrabold">{room.job.title}</h2><p className="mt-1 text-sm text-slate-500">{other ?? "คู่สนทนา"}</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{room.job.status}</span>{unread && <span className="size-2 rounded-full bg-red-500" aria-label="ยังไม่อ่าน" />}</div>
            </div>
            {latest && <p className="mt-3 line-clamp-1 text-sm text-slate-600">{latest.body || (latest.attachmentUrl ? "รูปภาพแนบ" : "ข้อความ")}</p>}
          </a>;
        })}
      </section>
    </main>
  );
}
