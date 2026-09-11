"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BriefcaseBusiness, Hammer, LogOut, MessageCircle, WalletCards, Plus, Play, CheckCircle2, XCircle, Trash2, Pencil, Star } from "lucide-react";
import { api, AuthUser, clearSession, getChatReadAt, getStoredUser, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { io } from "socket.io-client";

type JobApplication = { id: string; professionalId: string; status: string; professional: { id: string; displayName: string; professional?: { bio?: string | null; verified: boolean } | null; _count?: { professionalReviews: number } } };
type Job = { id: string; title: string; category?: string; description?: string; amount: number; status: string; professionalId?: string | null; applications?: JobApplication[]; review?: { rating: number; comment?: string | null } | null; room?: { id: string }; payment?: { status: string }; customer?: { displayName: string } };
type Service = { id: string; title: string; category: string; description: string; amount: number };
const serviceCategories = ["ซ่อมแซมทั่วไป", "ต่อเติม–รีโนเวท", "ระบบไฟฟ้า", "ประปา", "ทาสี–วอลเปเปอร์", "ตรวจบ้าน–คอนโด", "แอร์และเครื่องใช้ไฟฟ้า", "ทำความสะอาด", "สวนและภูมิทัศน์", "ออกแบบบ้าน", "ออกแบบตกแต่งภายใน", "ตัดต้นไม้", "อื่นๆ"];
type ChatMessage = { id: string; body: string; createdAt: string; sender: { id: string; displayName: string } };

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [unreadChats, setUnreadChats] = useState<Record<string, number>>({});
  const [notificationReady, setNotificationReady] = useState(() => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted");

  useEffect(() => {
    api<AuthUser>("/api/me")
      .then(async (currentUser) => {
        const currentJobs = await api<Job[]>("/api/jobs");
        setUser(currentUser);
        setJobs(currentJobs);
        if (currentUser.role === "PROFESSIONAL" || currentUser.role === "CONTRACTOR") {
          setAvailableJobs(await api<Job[]>("/api/jobs/available"));
          setServices(await api<Service[]>("/api/services"));
        }
      })
      .catch((caught) => { setError(caught instanceof Error ? caught.message : "โหลดข้อมูลไม่สำเร็จ"); router.replace("/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => setNotificationReady(permission === "granted")).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!user || jobs.length === 0) return;
    let firstPoll = true;
    const checkChats = async () => {
      const entries = await Promise.all(jobs.filter((job) => job.room).map(async (job) => {
        const messages = await api<ChatMessage[]>(`/api/chat/rooms/${job.room!.id}/messages`);
        const incoming = messages.filter((message) => message.sender.id !== user.id);
        const unread = incoming.filter((message) => new Date(message.createdAt).getTime() > getChatReadAt(job.room!.id));
        return { job, unread, latest: incoming[incoming.length - 1] };
      }));
      const nextUnread: Record<string, number> = {};
      for (const { job, unread, latest } of entries) {
        if (!job.room) continue;
        if (unread.length > 0) nextUnread[job.room.id] = unread.length;
        if (!firstPoll && latest && new Date(latest.createdAt).getTime() > getChatReadAt(job.room.id) && notificationReady && document.hidden) {
          new Notification(`ข้อความใหม่จาก ${latest.sender.displayName}`, { body: latest.body, tag: job.room.id });
        }
      }
      setUnreadChats(nextUnread);
      firstPoll = false;
    };
    void checkChats();
    const timer = window.setInterval(() => void checkChats(), 5000);
    return () => window.clearInterval(timer);
  }, [jobs, notificationReady, user]);

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;
    const socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", {
      auth: { token },
    });
    socket.on("job:application:new", (event: { jobId: string; application: JobApplication }) => {
      if (user.role !== "CUSTOMER") return;
      void api<Job[]>("/api/jobs").then(setJobs).catch(() => undefined);
      const message = `ช่าง ${event.application.professional.displayName} กดรับงานของคุณแล้ว`;
      setError(message);
      if (notificationReady && document.hidden) {
        new Notification("มีช่างกดรับงานใหม่", { body: message });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [notificationReady, user]);

  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const form = new FormData(event.currentTarget);
      const title = String(form.get("title") ?? "").trim();
      const category = String(form.get("category") ?? "").trim();
      const description = String(form.get("description") ?? "").trim();
      const amount = Math.round(Number(form.get("amount") ?? 0) * 100);
      if (!title || amount <= 0) { setCreateError("กรุณากรอกชื่องานและงบประมาณ"); return; }
      if (isProfessional) {
        const savedService = await api<Service>(editingService ? `/api/services/${editingService.id}` : "/api/services", {
          method: editingService ? "PUT" : "POST",
          body: JSON.stringify({ title, category, description, amount }),
        });
        setServices((items) => editingService ? items.map((item) => item.id === savedService.id ? savedService : item) : [savedService, ...items]);
      } else {
        const newJob = await api<Job>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ title, category, description, amount }),
        });
        setJobs([newJob, ...jobs]);
      }
      setDialogOpen(false);
      setEditingService(null);
      (event.target as HTMLFormElement).reset();
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setCreating(false);
    }

  }

  async function deleteService(serviceId: string) {
    try {
      await api<void>(`/api/services/${serviceId}`, { method: "DELETE" });
      setServices((items) => items.filter((service) => service.id !== serviceId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ลบบริการไม่สำเร็จ");
    }
  }

  function openServiceEditor(service: Service) {
    setEditingService(service);
    setCreateError("");
    setDialogOpen(true);
  }

  async function claimJob(jobId: string) {
    try {
      const claimedJob = await api<Job>(`/api/jobs/${jobId}/claim`, { method: "POST" });
      setAvailableJobs((items) => items.filter((job) => job.id !== jobId));
      setJobs((items) => [claimedJob, ...items]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "รับงานไม่สำเร็จ");
    }

  }

  async function selectProvider(jobId: string, professionalId: string) {
    try {
      const selectedJob = await api<Job>(`/api/jobs/${jobId}/select-provider`, {
        method: "POST",
        body: JSON.stringify({ professionalId }),
      });
      setJobs((items) => items.map((job) => job.id === jobId ? selectedJob : job));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เลือกช่างไม่สำเร็จ");
    }
  }

  async function changeStatus(jobId: string, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    try {
      const updatedJob = await api<Job>(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setJobs((items) => items.map((job) => job.id === jobId ? updatedJob : job));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }

    async function submitReview(event: FormEvent<HTMLFormElement>, jobId: string) {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const review = await api<Job["review"]>(`/api/jobs/${jobId}/review`, { method: "POST", body: JSON.stringify({ rating: Number(form.get("rating")), comment: String(form.get("comment") ?? "").trim() }) });
        setJobs((items) => items.map((job) => job.id === jobId ? { ...job, review } : job));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "ส่งรีวิวไม่สำเร็จ");
      }
    }
  }

  function logout() { clearSession(); router.replace("/login"); }
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100"><p className="font-bold text-slate-500">กำลังโหลดบัญชี...</p></main>;

  const isCustomer = user?.role === "CUSTOMER";
  const isProfessional = user?.role === "PROFESSIONAL" || user?.role === "CONTRACTOR";
  const isContractor = user?.role === "CONTRACTOR";

  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex h-18 max-w-5xl items-center justify-between px-4">
      <a href="/" className="flex items-center gap-2 text-xl font-black"><span className="grid size-10 place-items-center rounded-xl bg-[#ff6b2c] text-white"><Hammer size={20}/></span>Nine<span className="-ml-2 text-[#ff6b2c]">Chang</span></a>
      <div className="flex items-center gap-3"><a href="/messages" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="ข้อความใหม่"><Bell size={20}/>{Object.values(unreadChats).reduce((total, count) => total + count, 0) > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{Object.values(unreadChats).reduce((total, count) => total + count, 0)}</span>}</a><a href="/account" className="text-right hover:text-[#ff6b2c]"><b className="block text-sm">{user?.displayName}</b><span className="text-xs text-slate-500">{user?.role === "PROFESSIONAL" ? "บัญชีช่าง" : user?.role === "CONTRACTOR" ? "บัญชีผู้รับเหมา" : "บัญชีลูกค้า"}</span></a><Button variant="outline" onClick={logout}><LogOut size={17}/> ออกจากระบบ</Button></div></div>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between"><div><h1 className="text-3xl font-black">{isProfessional ? (isContractor ? "บริการของผู้รับเหมา" : "บริการของฉัน") : "งานของฉัน"}</h1><p className="mt-1 text-slate-500">{isContractor ? "นำเสนอบริการ คุมงาน ตรวจงาน และส่งมอบตามแบบและสัญญา" : "ติดตามงาน ข้อความ และการชำระเงิน"}</p></div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingService(null); setCreateError(""); } }}>
          <DialogTrigger asChild><Button className="bg-[#ff6b2c]"><Plus size={17}/> {isCustomer ? "สร้างงาน" : "เพิ่มบริการ"}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{isCustomer ? "สร้างงานใหม่" : editingService ? "แก้ไขบริการ" : "เพิ่มบริการใหม่"}</DialogTitle></DialogHeader>
            <form key={editingService?.id ?? "new"} onSubmit={handleCreateJob} className="grid gap-4">
              <div className="grid gap-2"><Label htmlFor="title">{isCustomer ? "ชื่องาน" : "ชื่อบริการ"}</Label><Input id="title" name="title" required defaultValue={editingService?.title} placeholder={isCustomer ? "เช่น ซ่อมแซมห้องน้ำ" : "เช่น งานติดตั้งไฟฟ้า"} maxLength={150}/></div>
              <div className="grid gap-2"><Label htmlFor="category">หมวดการให้บริการ</Label><select id="category" name="category" defaultValue={editingService?.category ?? serviceCategories[0]} className="h-10 rounded-md border border-input bg-white px-3 text-sm">{serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
              <div className="grid gap-2"><Label htmlFor="description">{isCustomer ? "รายละเอียดงาน" : "คำอธิบายบริการ"}</Label><Textarea id="description" name="description" required={isProfessional} defaultValue={editingService?.description} placeholder={isCustomer ? "อธิบายงานให้ช่างเข้าใจ..." : "อธิบายบริการและจุดแข็ง..."} maxLength={1000}/></div>
              <div className="grid gap-2"><Label htmlFor="amount">{isCustomer ? "งบประมาณ (บาท)" : "ราคาเริ่มต้น (บาท)"}</Label><Input id="amount" name="amount" type="number" defaultValue={editingService ? editingService.amount / 100 : undefined} min="100" max="9999999" step="100" required placeholder="เช่น 5000"/></div>
              {createError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{createError}</div>}
              <div className="flex gap-3"><Button disabled={creating} className="flex-1 bg-[#ff6b2c]">{creating ? "กำลังบันทึก..." : editingService ? "บันทึกการแก้ไข" : "สร้าง"}</Button><DialogClose asChild><Button variant="outline" className="flex-1" onClick={() => setEditingService(null)}>ยกเลิก</Button></DialogClose></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isContractor && <section className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4"><p className="font-bold text-orange-900">บทบาทผู้รับเหมา</p><p className="mt-1 text-sm text-orange-800">ดูแลการคุมงาน ตรวจคุณภาพ ประสานการแก้ไข และติดตามงานให้เป็นไปตามแบบและข้อตกลงกับลูกค้า</p></section>}
      {error && <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
      {!error && (isCustomer ? jobs.length === 0 : services.length === 0) && <section className="mt-7 grid place-items-center rounded-3xl border border-dashed bg-white px-5 py-16 text-center"><BriefcaseBusiness className="size-12 text-slate-300"/><h2 className="mt-4 text-xl font-black">ยังไม่มี{isCustomer ? "งาน" : "บริการ"}ในบัญชีนี้</h2><p className="mt-2 text-slate-500">{isCustomer ? "เมื่อสร้างงาน" : "เมื่อเพิ่มบริการ"} รายการจะแสดงที่นี่</p><Button className="mt-5 bg-[#ff6b2c]" onClick={() => setDialogOpen(true)}><Plus size={17}/> {isCustomer ? "สร้างงาน" : "เพิ่มบริการ"}</Button></section>}
      {isProfessional && services.length > 0 && <section className="mt-7"><h2 className="text-xl font-black">บริการของฉัน</h2><div className="mt-3 grid gap-4">{services.map((service) => <article key={service.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{service.category}</span><h2 className="mt-3 text-lg font-extrabold">{service.title}</h2><p className="mt-2 text-sm text-slate-600">{service.description}</p><p className="mt-2 font-bold text-[#ff6b2c]">เริ่มต้น ฿{(service.amount / 100).toLocaleString("th-TH")}</p></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => openServiceEditor(service)} aria-label="แก้ไขบริการ"><Pencil size={17}/></Button><Button variant="outline" size="icon" onClick={() => void deleteService(service.id)} aria-label="ลบบริการ"><Trash2 size={17}/></Button></div></div></article>)}</div></section>}
      {isProfessional && availableJobs.length > 0 && <section className="mt-7">
        <h2 className="text-xl font-black">{isContractor ? "งานที่เปิดรับผู้รับเหมา" : "งานที่เปิดรับช่าง"}</h2>
        <div className="mt-3 grid gap-4">{availableJobs.map((job) => <JobCard key={job.id} job={job} action={<Button className="bg-[#ff6b2c]" onClick={() => void claimJob(job.id)}>รับงาน</Button>} />)}</div>
      </section>}
      <div id="messages" className="mt-7 grid gap-4">{jobs.map((job) => <JobCard key={job.id} job={job} showApplications={isCustomer} onSelectProvider={isCustomer && job.status === "OPEN" ? (professionalId) => void selectProvider(job.id, professionalId) : undefined} action={<div className="flex flex-wrap gap-2">
        {job.room && <Button variant="outline" asChild><a href={`/chat/${job.room.id}`}><MessageCircle size={17}/> แชต{unreadChats[job.room.id] ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{unreadChats[job.room.id]}</span> : null}</a></Button>}
        {isCustomer && job.status !== "COMPLETED" && job.status !== "CANCELLED" && <Button variant="outline" onClick={() => void changeStatus(job.id, "CANCELLED")}><XCircle size={17}/> ยกเลิก</Button>}
        {isProfessional && job.status === "ACCEPTED" && <Button onClick={() => void changeStatus(job.id, "IN_PROGRESS")}><Play size={17}/> เริ่มงาน</Button>}
        {isProfessional && job.status === "IN_PROGRESS" && <Button onClick={() => void changeStatus(job.id, "COMPLETED")}><CheckCircle2 size={17}/> ส่งมอบงาน</Button>}
        {isCustomer && <Button asChild className="bg-[#ff6b2c]"><a href={`/pay/${job.id}?amount=${job.amount}`}><WalletCards size={17}/> ชำระเงิน</a></Button>}
        {isCustomer && job.status === "COMPLETED" && job.professionalId && !job.review && <ReviewForm jobId={job.id} onSubmit={submitReview} />}
        {isCustomer && job.review && <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3"><div className="flex items-center gap-2 text-sm font-bold text-amber-700"><span>รีวิวของคุณ</span><span className="flex" aria-label={`${job.review.rating} ดาว`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} className={star <= job.review!.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}</span></div>{job.review.comment && <p className="mt-1 text-sm text-slate-600">“{job.review.comment}”</p>}</div>}
      </div>} />)}</div>
    </div>
  </main>;
}

function JobCard({ job, action, showApplications = false, onSelectProvider }: { job: Job; action: ReactNode; showApplications?: boolean; onSelectProvider?: (professionalId: string) => void }) {
  const applications = showApplications ? job.applications ?? [] : [];
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{job.status}</span>
            {job.category && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{job.category}</span>}
          </div>
          <h2 className="mt-3 text-lg font-extrabold">{job.title}</h2>
          {job.customer && <p className="mt-1 text-sm text-slate-500">ลูกค้า: {job.customer.displayName}</p>}
          {job.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{job.description}</p>}
          <p className="mt-2 font-bold text-[#ff6b2c]">฿{(job.amount / 100).toLocaleString("th-TH")}</p>
          {applications.length > 0 && (
            <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
              <p className="text-sm font-bold text-orange-900">ช่างที่กดรับงาน ({applications.length})</p>
              <div className="mt-2 grid gap-2">
                {applications.map((application) => (
                  <div key={application.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
                    <div>
                      <a href={`/professionals/${application.professional.id}`} className="font-bold text-[#d84e17] hover:underline">{application.professional.displayName}</a>
                      <p className="text-xs text-slate-500">{application.professional.professional?.bio || "ยังไม่มีคำแนะนำตัว"}{application.professional._count ? ` · ${application.professional._count.professionalReviews} รีวิว` : ""}</p>
                      <p className={`mt-1 text-xs font-bold ${application.status === "SELECTED" ? "text-emerald-600" : application.status === "REJECTED" ? "text-slate-400" : "text-amber-600"}`}>{application.status === "SELECTED" ? "ได้รับเลือก" : application.status === "REJECTED" ? "ไม่ได้รับเลือก" : "รอการพิจารณา"}</p>
                    </div>
                    {onSelectProvider && <Button size="sm" className="bg-[#ff6b2c]" onClick={() => onSelectProvider(application.professionalId)}>เลือกช่าง</Button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {job.review && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700"><span>รีวิวจากลูกค้า</span><span className="flex">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={14} className={star <= job.review!.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}</span></div>}
        </div>
        <div className="flex flex-wrap gap-2">{action}</div>
      </div>
    </article>
  );
}

function ReviewForm({ jobId, onSubmit }: { jobId: string; onSubmit: (event: FormEvent<HTMLFormElement>, jobId: string) => void }) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  return <form onSubmit={(event) => onSubmit(event, jobId)} className="mt-4 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-extrabold text-slate-800">งานนี้เป็นอย่างไรบ้าง?</p><p className="text-xs text-slate-500">แบ่งปันประสบการณ์เพื่อช่วยลูกค้าคนต่อไป</p></div>
      <div className="flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-sm" onMouseLeave={() => setHoveredRating(0)}>
        <span className="mr-1 text-xs font-bold text-slate-500">ให้คะแนน</span>
        {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" aria-label={`${star} ดาว`} onMouseEnter={() => setHoveredRating(star)} onClick={() => setRating(star)} className="rounded-full p-0.5 transition-transform hover:scale-125"><Star size={23} className={(star <= (hoveredRating || rating)) ? "fill-amber-400 text-amber-400" : "text-slate-300"} /></button>)}
      </div>
    </div>
    <input type="hidden" name="rating" value={rating} />
    <Input name="comment" placeholder="เขียนความคิดเห็นสั้น ๆ (ไม่บังคับ)" maxLength={1000} className="mt-3 h-10 border-white bg-white/80" />
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{rating ? `${rating} จาก 5 ดาว` : "แตะดาวเพื่อให้คะแนน"}</span><Button disabled={!rating} size="sm" className="bg-[#ff6b2c] px-5">ส่งรีวิว</Button></div>
  </form>;
}
