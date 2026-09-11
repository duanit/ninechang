"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Star } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Professional = {
  id: string;
  displayName: string;
  role: "PROFESSIONAL" | "CONTRACTOR";
  rating: number;
  reviews: number;
  professional?: { bio?: string | null; verified: boolean; kycStatus: string } | null;
  services: { id: string; title: string; category: string; description: string; amount: number }[];
  portfolioItems: { id: string; title: string; description?: string | null; imageUrl?: string | null }[];
  professionalReviews: { rating: number; comment?: string | null; createdAt: string; customer: { displayName: string } }[];
};

export default function ProfessionalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [error, setError] = useState("");
  const [contacting, setContacting] = useState("");

  async function contactService(serviceId: string) {
    const user = getStoredUser();
    if (!user) {
      router.push("/login?mode=login");
      return;
    }
    setContacting(serviceId);
    try {
      const result = await api<{ roomId: string }>(`/api/services/${serviceId}/contact`, { method: "POST" });
      router.push(`/chat/${result.roomId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เริ่มแชตไม่สำเร็จ");
    } finally {
      setContacting("");
    }
  }

  useEffect(() => {
    api<Professional>(`/api/professionals/${params.id}/public`).then(setProfessional).catch((caught) => setError(caught instanceof Error ? caught.message : "โหลดโปรไฟล์ไม่สำเร็จ"));
  }, [params.id]);

  if (error) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center"><div><p className="font-bold text-red-600">{error}</p><Button className="mt-4" onClick={() => router.back()}>กลับ</Button></div></main>;
  if (!professional) return <main className="grid min-h-screen place-items-center bg-slate-100">กำลังโหลดโปรไฟล์...</main>;

  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center px-4"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft size={18}/> กลับ</Button><span className="ml-3 font-black">{professional.role === "CONTRACTOR" ? "โปรไฟล์ผู้รับเหมา" : "โปรไฟล์ช่าง"}</span></div></header>
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <section className="rounded-3xl bg-[#111a27] p-6 text-white shadow-lg sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid size-20 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-orange-400 to-amber-500 text-3xl font-black">{professional.displayName.slice(0, 1)}</div><div><p className="text-sm font-bold text-orange-300">{professional.role === "CONTRACTOR" ? "ผู้รับเหมา • คุมงานตามแบบและสัญญา" : "ช่าง • รับงานและลงมือทำเอง"}</p><h1 className="text-2xl font-black">{professional.displayName} {professional.professional?.verified && <BadgeCheck className="inline text-blue-300" size={23}/>}</h1><p className="mt-2 text-slate-300">{professional.professional?.bio || "ช่างมืออาชีพพร้อมให้บริการ"}</p><div className="mt-3 flex items-center gap-2 text-amber-300"><Star className="fill-amber-300" size={18}/><b>{professional.rating ? professional.rating.toFixed(1) : "ยังไม่มีคะแนน"}</b><span className="text-sm text-slate-300">({professional.reviews} รีวิว)</span></div></div></div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-black">บริการของช่าง</h2><div className="mt-4 grid gap-3">{professional.services.length ? professional.services.map((service) => <article key={service.id} className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><span className="text-xs font-bold text-orange-600">{service.category}</span><h3 className="mt-1 font-extrabold">{service.title}</h3><p className="mt-1 text-sm text-slate-600">{service.description}</p><p className="mt-2 font-bold text-[#ff6b2c]">เริ่มต้น ฿{(service.amount / 100).toLocaleString("th-TH")}</p></div><Button disabled={contacting === service.id} onClick={() => void contactService(service.id)} className="bg-[#ff6b2c]">{contacting === service.id ? "กำลังเปิดแชต..." : "ติดต่อช่าง"}</Button></div></article>) : <p className="text-sm text-slate-500">ช่างยังไม่ได้เพิ่มบริการ</p>}</div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-black">ผลงานที่ผ่านมา</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{professional.portfolioItems.length ? professional.portfolioItems.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border">{item.imageUrl && <img src={item.imageUrl} alt={item.title} className="h-44 w-full object-cover"/>}<div className="p-4"><h3 className="font-extrabold">{item.title}</h3>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</div></article>) : <p className="text-sm text-slate-500">ช่างยังไม่ได้เพิ่มผลงาน</p>}</div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-black">รีวิวจากลูกค้า</h2><div className="mt-4 grid gap-3">{professional.professionalReviews.length ? professional.professionalReviews.map((review, index) => <article key={`${review.createdAt}-${index}`} className="rounded-xl bg-amber-50/60 p-4"><div className="flex items-center justify-between gap-3"><b>{review.customer.displayName}</b><span className="flex" aria-label={`${review.rating} ดาว`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} className={star <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}</span></div>{review.comment && <p className="mt-2 text-sm text-slate-600">“{review.comment}”</p>}</article>) : <p className="text-sm text-slate-500">ยังไม่มีรีวิว</p>}</div></section>
    </div>
  </main>;
}
