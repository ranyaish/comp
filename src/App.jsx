import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// קורא קודם מסודות ה-Build (VITE_*) ואם לא – מגיבוי ב-index.html
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || window.__SUPABASE_URL__ || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY__ || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  alert("חסר SUPABASE URL/KEY – הגדר ב-Secrets או ב-index.html");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// עובדים בתוך סכימה comp – לכן שם הטבלה ללא prefix
const db = supabase.schema("comp");

// UI helpers
const Label = ({ children }) => <label className="block text-sm mb-1 font-medium">{children}</label>;
const Input = (p) => <input {...p} className={`w-full rounded-2xl border px-3 py-2 ${p.className||""}`} />;
const Textarea = (p) => <textarea {...p} className={`w-full rounded-2xl border px-3 py-2 ${p.className||""}`} />;
const Button = ({ children, className="", ...rest }) => <button {...rest} className={`rounded-2xl px-4 py-2 shadow-sm border ${className}`}>{children}</button>;

// ולידציה לטלפון
function normalizePhone(v){ return (v||"").replace(/\D/g,""); }
const phoneRegex = /^0?5\d{8}$/;

// רשימת קופונים
const COUPONS = [
  { key: "FOCACCIA",  label: "פוקאצ'ה לבחירה" },
  { key: "TOPPING1",  label: "תוספת חינם" },
  { key: "TOPPINGS2", label: "שתי תוספות חינם" },
  { key: "DESSERT",   label: "קינוח לבחירה" },
  { key: "CREDIT",    label: "סכום זיכוי" },
];

// מודאל בחירת קופון
function Modal({ open, onClose, children, title }){
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-[min(92vw,560px)] max-h-[85vh] overflow-auto p-5">
        {title && <h3 className="text-lg font-semibold mb-3">{title}</h3>}
        {children}
        <div className="mt-4 text-right"><Button onClick={onClose}>סגור</Button></div>
      </div>
    </div>
  );
}

// מסך התחברות (שם משתמש = אימייל)
function Login(){
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function signin(e){
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if(error) alert("שגיאת התחברות: " + error.message);
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={signin} className="w-[min(92vw,420px)] border rounded-2xl p-5 grid gap-3">
        <h1 className="text-2xl font-bold mb-2 text-center">כניסה למערכת</h1>
        <div>
          <Label>שם משתמש (אימייל)</Label>
          <Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <Label>סיסמה</Label>
          <Input required type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="bg-black text-white" disabled={loading}>{loading?"מתחבר...":"כניסה"}</Button>
      </form>
    </div>
  );
}

export default function App(){
  // Auth state
  const [session, setSession] = useState(null);
  useEffect(()=>{
    supabase.auth.getSession().then(({ data })=> setSession(data.session||null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s)=> setSession(s));
    return ()=> subscription.unsubscribe();
  },[]);

  // חיפוש והצגה
  const [queryPhone, setQueryPhone] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // טופס הזנה
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [approverName, setApproverName] = useState(""); // שדה מאוחד: “שם מאשר הפיצוי”

  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponType, setCouponType] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  const phoneValid = useMemo(()=> phoneRegex.test(phone), [phone]);

  async function fetchByPhone(p){
    if(!session) return alert("יש להתחבר למערכת");
    const ph = normalizePhone(p);
    if(!ph){ setRows([]); return; }
    setLoading(true);
    const { data, error } = await db
      .from("customers_coupons")
      .select("*")
      .eq("phone", ph)
      .order("created_at", { ascending: false });
    setLoading(false);
    if(error) return alert("שגיאה בטעינה: "+error.message);
    setRows(data||[]);
  }

  async function addCoupon(e){
  e.preventDefault();
  if(!session) return alert("יש להתחבר למערכת");

  const ph = normalizePhone(phone);
  if(!phoneRegex.test(ph)) return alert("מספר טלפון לא תקין");
  if(!name.trim()) return alert("יש להזין שם הלקוח");
  if(!couponType) return alert("בחר קופון");
  if(couponType==="CREDIT" && (!creditAmount || isNaN(Number(creditAmount)))) return alert("סכום זיכוי לא תקין");
  if(!reason.trim()) return alert("יש להזין סיבת הפיצוי");
  if(!approverName.trim()) return alert("יש להזין שם מאשר הפיצוי");

  const couponText =
    couponType==="CREDIT"
      ? `סכום זיכוי: ₪${Number(creditAmount)}`
      : (COUPONS.find(c=>c.key===couponType)?.label || couponType);

  const payload = {
    phone: ph,
    name: name.trim(),
    coupon_type: couponText,
    reason: reason.trim(),
    created_by: approverName.trim(), // ← משתמשים בעמודה קיימת
    redeemed: false,
    redeemed_at: null,
    redeemed_by: null,
    created_at: new Date(),   // תאריך יצירה אוטומטי
    updated_at: new Date()
  };

  const { error } = await db.from("customers_coupons").insert(payload);
  if(error) return alert("שגיאה בשמירה: "+error.message);

  // ✅ חדש: הודעת אישור
  alert(`פיצוי עבור "${name.trim()}" הוזן בהצלחה`);

  // איפוס טופס
  setReason(""); 
  setApproverName("");
  setCouponType(""); 
  setCreditAmount("");

  // ✅ חדש: רענון מיידי של כרטיס הלקוח
  setQueryPhone(ph);
  await fetchByPhone(ph);

  // אופציונלי: סגירת מודאל הקופון אם פתוח
  setCouponModalOpen(false);
}
    const ph = normalizePhone(phone);
    if(!phoneRegex.test(ph)) return alert("מספר טלפון לא תקין");
    if(!name.trim()) return alert("יש להזין שם הלקוח");
    if(!couponType) return alert("בחר קופון");
    if(couponType==="CREDIT" && (!creditAmount || isNaN(Number(creditAmount)))) return alert("סכום זיכוי לא תקין");
    if(!reason.trim()) return alert("יש להזין סיבת הפיצוי");
    if(!approverName.trim()) return alert("יש להזין שם מאשר הפיצוי");

    const couponText =
      couponType==="CREDIT"
        ? `סכום זיכוי: ₪${Number(creditAmount)}`
        : (COUPONS.find(c=>c.key===couponType)?.label || couponType);

    const payload = {
      phone: ph,
      name: name.trim(),
      coupon_type: couponText,
      reason: reason.trim(),
      created_by: approverName.trim(), // ← משתמשים בעמודה קיימת
      redeemed: false,
      redeemed_at: null,
      redeemed_by: null,
      created_at: new Date(),   // תאריך יצירה אוטומטי
      updated_at: new Date()
    };

    const { error } = await db.from("customers_coupons").insert(payload);
    if(error) return alert("שגיאה בשמירה: "+error.message);

    // איפוס טופס
    setReason(""); setApproverName("");
    setCouponType(""); setCreditAmount("");
    setQueryPhone(ph); // יציג בכרטיס הלקוח
  }

  async function redeemCoupon(rec){
    if(!session) return alert("יש להתחבר למערכת");
    const approver = prompt("שם מאשר המימוש:");
    if(!approver) return;
    const { error } = await db
      .from("customers_coupons")
      .update({ redeemed: true, redeemed_at: new Date(), redeemed_by: approver })
      .eq("id", rec.id);
    if(error) return alert("שגיאה במימוש: "+error.message);
    fetchByPhone(rec.phone);
  }

  if(!session){
    return <Login />
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">מערכת ניהול פיצויים</h1>
        <Button onClick={()=> supabase.auth.signOut()} className="bg-gray-100">התנתק</Button>
      </div>

      {/* חיפוש לפי טלפון */}
      <div className="mb-4 grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label>איתור לפי טלפון</Label>
          <Input value={queryPhone} onChange={e=>setQueryPhone(e.target.value.replace(/\D/g,""))} placeholder="0521234567" required />
        </div>
        <div className="flex items-end">
          <Button onClick={()=>fetchByPhone(queryPhone)} className="bg-black text-white w-full">חיפוש</Button>
        </div>
      </div>

      {/* טופס הזנת פיצוי */}
      <form onSubmit={addCoupon} className="grid md:grid-cols-2 gap-6 mb-10 border rounded-2xl p-4">
        <div>
          <Label>טלפון</Label>
          <Input required value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} placeholder="05XXXXXXXX" />
          {!phoneValid && phone && <p className="text-xs text-red-600 mt-1">מספר לא תקין</p>}
        </div>
        <div>
          <Label>שם הלקוח</Label>
          <Input required value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>קופון פיצוי</Label>
          <Button type="button" onClick={()=>setCouponModalOpen(true)} className={`${couponType?"bg-black text-white":""}`}>
            {couponType ? (couponType==="CREDIT" ? `סכום זיכוי: ₪${creditAmount||0}` : (COUPONS.find(c=>c.key===couponType)?.label)) : "בחר קופון"}
          </Button>
          {couponType==="CREDIT" && (
            <div className="max-w-xs mt-2">
              <Label>סכום זיכוי (₪)</Label>
              <Input required value={creditAmount} onChange={e=>setCreditAmount(e.target.value.replace(/[^\d.]/g,""))}/>
            </div>
          )}
        </div>
        <div>
          <Label>סיבת הפיצוי</Label>
          <Textarea required rows={2} value={reason} onChange={e=>setReason(e.target.value)} />
        </div>
        <div>
          <Label>שם מאשר הפיצוי</Label>
          <Input required value={approverName} onChange={e=>setApproverName(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" className="bg-black text-white">שמור פיצוי</Button>
        </div>
      </form>

      {/* כרטיס לקוח */}
      <div className="border rounded-2xl p-4">
        <h2 className="text-xl font-semibold mb-2">כרטיס לקוח {queryPhone && `• ${queryPhone}`}</h2>
        {rows.length===0 ? <p>אין פיצויים להצגה</p> : (
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-right p-2">קופון</th>
                <th className="text-right p-2">סיבה</th>
                <th className="text-right p-2">שם מאשר הפיצוי</th>
                <th className="text-right p-2">נוצר ב־</th>
                <th className="text-right p-2">סטטוס</th>
                <th className="text-right p-2">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.coupon_type}</td>
                  <td className="p-2">{r.reason||"—"}</td>
                  <td className="p-2">{r.created_by||"—"}</td>
                  <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td className="p-2">
                    {r.redeemed ? `מומש ב-${new Date(r.redeemed_at).toLocaleString()} ע"י ${r.redeemed_by}` : "פתוח"}
                  </td>
                  <td className="p-2">
                    {!r.redeemed && <Button onClick={()=>redeemCoupon(r)} className="bg-green-600 text-white">ממש</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* מודאל קופונים */}
      <Modal open={couponModalOpen} onClose={()=>setCouponModalOpen(false)} title="בחר קופון">
        <div className="grid gap-2">
          {COUPONS.map(opt=>(
            <Button key={opt.key} onClick={()=>setCouponType(opt.key)} className={`text-right ${couponType===opt.key?"bg-black text-white":""}`}>
              {opt.label}
            </Button>
          ))}
        </div>
        {couponType==="CREDIT" && (
          <div className="mt-4 max-w-xs">
            <Label>סכום זיכוי (₪)</Label>
            <Input required value={creditAmount} onChange={e=>setCreditAmount(e.target.value.replace(/[^\d.]/g,""))}/>
          </div>
        )}
        <div className="mt-3 text-right">
          <Button className="bg-black text-white" onClick={()=>setCouponModalOpen(false)}>אישור</Button>
        </div>
      </Modal>
    </div>
  );
}
