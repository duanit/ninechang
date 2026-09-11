"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Landmark, LockKeyhole, ShieldCheck, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, apiFormData, AuthUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [professionalMessage, setProfessionalMessage] = useState("");
  const [payoutMessage, setPayoutMessage] = useState("");
  const [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState<{ id: string; title: string; description?: string | null; imageUrl?: string | null }[]>([]);

  useEffect(() => {
    api<AuthUser>("/api/me").then(async (currentUser) => { setUser(currentUser); if (currentUser.role === "PROFESSIONAL" || currentUser.role === "CONTRACTOR") setPortfolio(await api("/api/portfolio")); }).catch(() => router.replace("/login"));
  }, [router]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setProfileMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api<AuthUser>("/api/me", { method: "PATCH", body: JSON.stringify({
        displayName: String(form.get("displayName") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim() || null,
      }) });
      setUser(updated); localStorage.setItem("ninechang_user", JSON.stringify(updated));
      setProfileMessage("บันทึกข้อมูลส่วนตัวแล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกข้อมูลไม่สำเร็จ"); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPasswordMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) { setError("รหัสผ่านใหม่ไม่ตรงกัน"); return; }
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }) });
      formElement.reset(); setPasswordMessage("เปลี่ยนรหัสผ่านสำเร็จ");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ"); }
  }

  async function updatePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPinMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const pin = String(form.get("pin") ?? "");
    if (pin !== String(form.get("confirmPin") ?? "")) { setError("PIN ใหม่ไม่ตรงกัน"); return; }
    try {
      await api("/api/me/pin", { method: "POST", body: JSON.stringify({ currentPin: String(form.get("currentPin") ?? "") || undefined, pin }) });
      formElement.reset(); setPinMessage("บันทึก PIN สำเร็จ");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึก PIN ไม่สำเร็จ"); }
  }

  async function updateProfessionalProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setProfessionalMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const profile = await api<AuthUser["professional"]>("/api/me/professional-profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: String(form.get("bio") ?? "").trim() }),
      });
      setUser((current) => current ? { ...current, professional: profile } : current);
      setProfessionalMessage("บันทึกโปรไฟล์ช่างแล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกโปรไฟล์ช่างไม่สำเร็จ"); }
  }

  async function updatePayoutAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPayoutMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const profile = await api<{ bankLast4: string; kycStatus: string }>("/api/professional/payout-account", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          bankBrand: String(form.get("bankBrand") ?? ""),
          accountNumber: String(form.get("accountNumber") ?? "").trim(),
          accountName: String(form.get("accountName") ?? "").trim(),
        }),
      });
      setUser((current) => current?.professional ? { ...current, professional: { ...current.professional, ...profile } } : current);
      formElement.reset();
      setPayoutMessage(`บันทึกบัญชีรับเงินแล้ว • เลขท้าย ${profile.bankLast4} • สถานะ ${profile.kycStatus === "VERIFIED" ? "ยืนยันแล้ว" : "รอตรวจสอบ"}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกบัญชีรับเงินไม่สำเร็จ"); }
  }

  async function addPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const item = await apiFormData<typeof portfolio[number]>("/api/portfolio", form);
      setPortfolio((items) => [item, ...items]); formElement.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เพิ่มผลงานไม่สำเร็จ"); }
  }

  async function deletePortfolio(id: string) {
    try { await api(`/api/portfolio/${id}`, { method: "DELETE" }); setPortfolio((items) => items.filter((item) => item.id !== id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ลบผลงานไม่สำเร็จ"); }
  }

  if (!user) return <main className="grid min-h-screen place-items-center bg-slate-100">กำลังโหลดบัญชี...</main>;
  return <main className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft size={18}/> กลับ</Button><h1 className="ml-3 text-xl font-black">บัญชีของฉัน</h1></div></header>
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><UserCircle className="text-[#ff6b2c]" size={28}/><div><h2 className="font-black">ข้อมูลส่วนตัว</h2><p className="text-sm text-slate-500">{user.role === "PROFESSIONAL" ? "บัญชีช่าง" : user.role === "CONTRACTOR" ? "บัญชีผู้รับเหมา" : "บัญชีลูกค้า"}</p></div></div>
        <form onSubmit={updateProfile} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="displayName">ชื่อที่แสดง</Label><Input id="displayName" name="displayName" defaultValue={user.displayName} required minLength={2} maxLength={100}/></div><div className="grid gap-2"><Label htmlFor="email">อีเมล</Label><Input id="email" value={user.email} disabled/></div><div className="grid gap-2"><Label htmlFor="phone">เบอร์โทรศัพท์</Label><Input id="phone" name="phone" defaultValue={user.phone ?? ""} maxLength={30} placeholder="สำหรับติดต่อเรื่องงาน"/></div>{profileMessage && <p className="text-sm text-green-700">{profileMessage}</p>}<Button className="w-fit bg-[#ff6b2c]">บันทึกข้อมูล</Button></form>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><LockKeyhole className="text-[#ff6b2c]" size={25}/><h2 className="font-black">เปลี่ยนรหัสผ่าน</h2></div><form onSubmit={updatePassword} className="grid gap-4"><Input name="currentPassword" type="password" required placeholder="รหัสผ่านปัจจุบัน"/><Input name="newPassword" type="password" minLength={8} required placeholder="รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"/><Input name="confirmPassword" type="password" minLength={8} required placeholder="ยืนยันรหัสผ่านใหม่"/>{passwordMessage && <p className="text-sm text-green-700">{passwordMessage}</p>}<Button variant="outline" className="w-fit">เปลี่ยนรหัสผ่าน</Button></form></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><ShieldCheck className="text-[#ff6b2c]" size={25}/><div><h2 className="font-black">PIN ความปลอดภัย</h2><p className="text-sm text-slate-500">ใช้ PIN 6 หลักสำหรับการยืนยันตัวตนเพิ่มเติม</p></div></div><form onSubmit={updatePin} className="grid gap-4"><Input name="currentPin" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="PIN เดิม (กรณีเปลี่ยน PIN)"/><Input name="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} required placeholder="PIN ใหม่ 6 หลัก"/><Input name="confirmPin" inputMode="numeric" pattern="\d{6}" maxLength={6} required placeholder="ยืนยัน PIN ใหม่"/>{pinMessage && <p className="text-sm text-green-700">{pinMessage}</p>}<Button variant="outline" className="w-fit">บันทึก PIN</Button></form></section>
      {(user.role === "PROFESSIONAL" || user.role === "CONTRACTOR") && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><BadgeCheck className="text-[#ff6b2c]" size={25}/><div><h2 className="font-black">{user.role === "CONTRACTOR" ? "โปรไฟล์ผู้รับเหมา" : "โปรไฟล์ช่าง"}</h2><p className="text-sm text-slate-500">{user.professional?.verified ? "ยืนยันตัวตนแล้ว" : "สถานะยืนยันตัวตน: รอตรวจสอบ"}</p></div></div><form onSubmit={updateProfessionalProfile} className="grid gap-4"><Label htmlFor="bio">แนะนำตัวและประสบการณ์</Label><textarea id="bio" name="bio" defaultValue={user.professional?.bio ?? ""} maxLength={2000} rows={5} placeholder={user.role === "CONTRACTOR" ? "บอกประสบการณ์การคุมงาน ตรวจงาน และพื้นที่ให้บริการ" : "บอกประสบการณ์ พื้นที่ให้บริการ และงานที่ถนัด"} className="rounded-md border border-input bg-white px-3 py-2 text-sm"/>{professionalMessage && <p className="text-sm text-green-700">{professionalMessage}</p>}<Button className="w-fit bg-[#ff6b2c]">บันทึกโปรไฟล์</Button></form></section>}
      {(user.role === "PROFESSIONAL" || user.role === "CONTRACTOR") && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><Landmark className="text-[#ff6b2c]" size={25}/><div><h2 className="font-black">บัญชีรับเงิน</h2><p className="text-sm text-slate-500">{user.professional?.bankLast4 ? `ผูกบัญชีเลขท้าย ${user.professional.bankLast4}` : "เพิ่มบัญชีเพื่อรับเงินหลังจบงาน"}</p></div></div><form onSubmit={updatePayoutAccount} className="grid gap-4"><Input name="name" required minLength={2} placeholder="ชื่อเจ้าของบัญชี"/><Input name="email" type="email" required defaultValue={user.email} placeholder="อีเมลสำหรับบัญชีรับเงิน"/><select name="bankBrand" required className="h-10 rounded-md border border-input bg-white px-3 text-sm"><option value="">เลือกธนาคาร</option><option value="bbl">ธนาคารกรุงเทพ</option><option value="kbank">กสิกรไทย</option><option value="ktb">กรุงไทย</option><option value="scb">ไทยพาณิชย์</option><option value="bay">กรุงศรีอยุธยา</option><option value="tmb">ทีเอ็มบีธนชาต</option></select><Input name="accountNumber" inputMode="numeric" pattern="\d{8,16}" maxLength={16} required placeholder="เลขบัญชี 8-16 หลัก"/><Input name="accountName" required minLength={2} placeholder="ชื่อบัญชีตามธนาคาร"/>{payoutMessage && <p className="text-sm text-green-700">{payoutMessage}</p>}<p className="text-xs text-slate-500">ระบบจะจัดเก็บเฉพาะเลขบัญชี 4 หลักสุดท้ายหลังเชื่อมต่อสำเร็จ</p><Button className="w-fit bg-[#ff6b2c]">บันทึกบัญชีรับเงิน</Button></form></section>}
      {(user.role === "PROFESSIONAL" || user.role === "CONTRACTOR") && <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-black">ผลงานของฉัน</h2><p className="mt-1 text-sm text-slate-500">เพิ่มรูปและรายละเอียดผลงานเพื่อแสดงบนโปรไฟล์สาธารณะ</p><form onSubmit={addPortfolio} className="mt-4 grid gap-3"><Input name="title" required placeholder="ชื่อผลงาน เช่น ติดตั้งไฟบ้านสองชั้น"/><textarea name="description" rows={3} maxLength={2000} placeholder="รายละเอียดผลงาน" className="rounded-md border border-input px-3 py-2 text-sm"/><Input name="image" type="file" accept="image/*"/><Button className="w-fit bg-[#ff6b2c]">เพิ่มผลงาน</Button></form><div className="mt-5 grid gap-3 sm:grid-cols-2">{portfolio.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border">{item.imageUrl && <img src={item.imageUrl} alt={item.title} className="h-36 w-full object-cover"/>}<div className="p-3"><h3 className="font-bold">{item.title}</h3>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}<Button variant="outline" size="sm" className="mt-3" onClick={() => void deletePortfolio(item.id)}>ลบผลงาน</Button></div></article>)}</div></section>}
    </div>
  </main>;
}
