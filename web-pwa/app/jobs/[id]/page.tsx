"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, FileText, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PublicJob = { id: string; title: string; category: string; description: string; amount: number; status: string; createdAt: string; customer?: { displayName: string } };

export default function PublicJobDetailPage() {
  const params = useParams<{ id: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!params.id) return; api<PublicJob>(`/api/jobs/public/${params.id}`).then(setJob).catch((caught) => setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดรายละเอียดงานได้")); }, [params.id]);
  if (error) return <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4"><section className="text-center"><p className="text-red-600">{error}</p><Button asChild className="mt-4"><a href="/#jobs">กลับไปดูงาน</a></Button></section></main>;
  if (!job) return <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4 text-slate-500">กำลังโหลดรายละเอียดงาน...</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10"><div className="mx-auto max-w-3xl"><Button variant="ghost" asChild className="mb-5"><a href="/#jobs"><ArrowLeft size={17} /> กลับไปงานใหม่จากลูกค้า</a></Button><article className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-50 text-emerald-700">เปิดรับช่าง</Badge><Badge className="bg-orange-50 text-orange-700">{job.category}</Badge></div><h1 className="mt-5 text-3xl font-black text-slate-900 sm:text-4xl">{job.title}</h1><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500"><span><CalendarDays className="mr-1 inline size-4" />{new Date(job.createdAt).toLocaleDateString("th-TH")}</span>{job.customer && <span><MapPin className="mr-1 inline size-4" />ลูกค้า: {job.customer.displayName}</span>}</div><div className="mt-8 rounded-2xl bg-orange-50 p-5"><p className="text-sm text-orange-800">งบประมาณงาน</p><p className="mt-1 text-2xl font-black text-[#ff6b2c]">฿{(job.amount / 100).toLocaleString("th-TH")}</p></div><section className="mt-8"><h2 className="flex items-center gap-2 text-xl font-black"><FileText size={20} /> รายละเอียดงาน</h2><p className="mt-3 whitespace-pre-wrap break-words leading-8 text-slate-700">{job.description}</p></section><section className="mt-8 rounded-2xl border border-dashed bg-slate-50 p-5 text-sm text-slate-500"><p className="font-bold text-slate-700">ไฟล์แนบ</p><p className="mt-1">หากลูกค้าแนบไฟล์ รูปภาพ หรือเอกสาร จะแสดงในส่วนนี้</p></section></article></div></main>;
}
