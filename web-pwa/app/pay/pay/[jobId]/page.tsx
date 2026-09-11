"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, QrCode, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: "card",
        card: {
          name: string;
          number: string;
          expiration_month: number;
          expiration_year: number;
          security_code: string;
        },
        callback: (statusCode: number, response: { id?: string; message?: string }) => void,
      ) => void;
    };
  }
}

type Method = "card" | "promptpay" | "mobile_banking_scb" | "mobile_banking_bay" | "mobile_banking_bbl" | "mobile_banking_ktb";
type Payment = { status: string; method: string; authorizeUri?: string | null; amount: number };

const methods: { id: Method; name: string; description: string; icon: typeof CreditCard }[] = [
  { id: "promptpay", name: "PromptPay QR", description: "สแกน QR เพื่อชำระเงิน", icon: QrCode },
  { id: "mobile_banking_scb", name: "SCB EASY", description: "ชำระผ่านแอป SCB", icon: Smartphone },
  { id: "mobile_banking_bay", name: "Krungsri Mobile", description: "ชำระผ่านแอปกรุงศรี", icon: Smartphone },
  { id: "mobile_banking_bbl", name: "Bangkok Bank Mobile", description: "ชำระผ่านแอปธนาคารกรุงเทพ", icon: Smartphone },
  { id: "mobile_banking_ktb", name: "Krungthai NEXT", description: "ชำระผ่านแอปกรุงไทย", icon: Smartphone },
  { id: "card", name: "บัตรเครดิต/เดบิต", description: "ใช้ Card Token จาก Omise", icon: CreditCard },
];

export default function Pay() {
  const { jobId } = useParams<{ jobId: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const [method, setMethod] = useState<Method>("promptpay");
  const [cardToken, setCardToken] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const amount = useMemo(() => Number(query.get("amount") ?? 0), [query]);
  const displayAmount = payment?.amount ?? amount;

  useEffect(() => {
    if (method !== "card" || document.querySelector('script[src="https://cdn.omise.co/omise.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://cdn.omise.co/omise.js";
    script.async = true;
    document.head.appendChild(script);
  }, [method]);

  useEffect(() => {
    api<Payment>(`/api/payments/${jobId}`).then(setPayment).catch(() => undefined);
  }, [jobId]);

  async function checkout() {
    setError("");
    setLoading(true);
    try {
      let cardTokenValue = cardToken.trim();
      if (method === "card" && !cardToken.trim()) {
        if (!window.Omise) {
          setError("กำลังโหลดระบบบัตร กรุณาลองใหม่อีกครั้ง");
          return;
        }
        const publicKey = process.env.NEXT_PUBLIC_OPN_PUBLIC_KEY;
        if (!publicKey) {
          setError("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_OPN_PUBLIC_KEY");
          return;
        }
        if (!cardName.trim() || cardNumber.replace(/\s/g, "").length < 12 || !cardMonth || !cardYear || !cardCvc) {
          setError("กรุณากรอกข้อมูลบัตรให้ครบ");
          return;
        }
        window.Omise.setPublicKey(publicKey);
        let generatedToken = "";
        await new Promise<void>((resolve, reject) => {
          window.Omise?.createToken("card", {
            name: cardName.trim(),
            number: cardNumber.replace(/\s/g, ""),
            expiration_month: Number(cardMonth),
            expiration_year: Number(cardYear),
            security_code: cardCvc,
          }, (statusCode, response) => {
            if (statusCode === 200 && response.id) {
              generatedToken = response.id;
              setCardToken(response.id);
              resolve();
            } else {
              reject(new Error(response.message ?? "สร้าง Card Token ไม่สำเร็จ"));
            }
          });
        });
        cardTokenValue = generatedToken;
      }
      const token = method === "card" ? cardTokenValue : undefined;
      const result = await api<{ payment: Payment; authorizeUri?: string | null }>("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ jobId, method, ...(method === "card" ? { token } : {}) }),
      });
      setPayment(result.payment);
      if (method === "promptpay" && result.authorizeUri) {
        const dataUrl = await QRCode.toDataURL(result.authorizeUri, {
          width: 260,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(dataUrl);
      }
      if (result.authorizeUri && method !== "promptpay") {
        window.location.href = result.authorizeUri;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "สร้างรายการชำระเงินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  if (payment?.status === "PAID" || payment?.status === "RELEASED") {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto size-14 text-emerald-500" /><h1 className="mt-4 text-2xl font-black">ชำระเงินสำเร็จ</h1><p className="mt-2 text-slate-500">ระบบได้รับการชำระเงินแล้ว</p><Button className="mt-6 bg-[#ff6b2c]" onClick={() => router.push("/dashboard")}>กลับไปงานของฉัน</Button></section></main>;
  }

  return <main className="min-h-screen bg-slate-100 p-4"><section className="mx-auto w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm sm:p-8">
    <Button variant="ghost" className="mb-3 -ml-3" onClick={() => router.back()}><ArrowLeft size={17} /> ย้อนกลับ</Button>
    <h1 className="text-2xl font-black">ชำระเงิน NineChang</h1>
    <p className="mt-2 text-3xl font-black text-[#ff6b2c]">฿{(displayAmount / 100).toLocaleString("th-TH")}</p>
    <div className="mt-6 grid gap-3">{methods.map(({ id, name, description, icon: Icon }) => <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === id ? "border-[#ff6b2c] bg-orange-50" : "hover:border-orange-200"}`}><input type="radio" name="payment-method" value={id} checked={method === id} onChange={() => setMethod(id)} /><Icon size={21} className="text-[#ff6b2c]" /><span><b className="block">{name}</b><small className="text-slate-500">{description}</small></span></label>)}</div>
    {method === "card" && <div className="mt-4 grid gap-3 rounded-2xl border bg-slate-50 p-4"><p className="font-bold">ข้อมูลบัตรทดสอบ</p><Input value={cardName} onChange={(event) => setCardName(event.target.value)} placeholder="ชื่อบนบัตร" autoComplete="cc-name" /><Input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} placeholder="4242 4242 4242 4242" inputMode="numeric" autoComplete="cc-number" /><div className="grid grid-cols-3 gap-2"><Input value={cardMonth} onChange={(event) => setCardMonth(event.target.value)} placeholder="เดือน" inputMode="numeric" maxLength={2} /><Input value={cardYear} onChange={(event) => setCardYear(event.target.value)} placeholder="ปี ค.ศ." inputMode="numeric" maxLength={4} /><Input value={cardCvc} onChange={(event) => setCardCvc(event.target.value)} placeholder="CVC" inputMode="numeric" maxLength={4} autoComplete="cc-csc" /></div><p className="text-xs text-slate-500">ข้อมูลบัตรจะถูกส่งตรงไป Omise เพื่อสร้าง token เท่านั้น ระบบ NineChang จะไม่รับเลขบัตรหรือ CVC</p></div>}
    {method === "promptpay" && payment?.status === "AWAITING_ACTION" && <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-center"><h2 className="font-black">สแกน QR เพื่อชำระเงิน</h2>{qrDataUrl ? <img src={qrDataUrl} alt="PromptPay QR สำหรับชำระเงิน" className="mx-auto mt-4 size-64 rounded-xl bg-white p-2" /> : <p className="mt-4 text-sm text-amber-800">กำลังเตรียม QR Code...</p>}<p className="mt-3 text-xs text-slate-600">เปิดแอปธนาคารแล้วสแกน QR นี้ ยอดเงิน ฿{(displayAmount / 100).toLocaleString("th-TH")}</p></div>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button disabled={loading} onClick={() => void checkout()} className="mt-6 h-12 w-full bg-[#ff6b2c]">{loading ? <><Loader2 className="animate-spin" size={18} /> กำลังสร้างรายการ...</> : "ดำเนินการชำระเงิน"}</Button>
    {payment?.status === "AWAITING_ACTION" && <p className="mt-3 text-center text-sm text-amber-700">รอการยืนยันการชำระเงินจากธนาคาร ระบบจะอัปเดตผ่าน webhook</p>}
    <p className="mt-3 text-center text-xs text-slate-500">ระบบยืนยันผลจากผู้ให้บริการชำระเงินผ่าน webhook เท่านั้น</p>
  </section></main>;
}
